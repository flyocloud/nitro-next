import { nitroPageGenerateMetadata, initNitro } from './server';

/**
 * Regression guard for the social-preview image, exercised through the **real**
 * `@flyo/nitro-typescript` deserializer.
 *
 * `server.test.tsx` mocks the whole SDK, so its `PagesApi.page()` hands back a
 * hand-built plain object and `PageFromJSON()` never runs. That is precisely how
 * the 2.8.1 bug reached production: `@flyo/nitro-typescript@1.5.0` deserialized
 * `meta_json.image` — declared in the spec as `oneOf: [string, boolean]` — into
 * an empty object, so every `og:image` / `twitter:image` was dropped, while the
 * mocked test suite stayed green.
 *
 * These tests therefore mock only the *API classes* and run the raw API payload
 * through the actual `PageFromJSON()`, the way production does. They fail against
 * `@flyo/nitro-typescript@1.5.0` and pass from `1.6.0` on.
 */

// ./server → ./client pulls in the real js-bridge; keep it out of the jsdom run.
jest.mock('@flyo/nitro-js-bridge', () => ({
  highlightAndClick: jest.fn(),
  wysiwyg: jest.fn(() => ''),
  reload: jest.fn(),
  scrollTo: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('Not Found');
  }),
  usePathname: jest.fn(() => '/'),
}));

jest.mock('next/headers', () => ({
  headers: jest.fn(async () => ({ get: () => null })),
}));

// Invented fixture data. The only properties that matter here are structural: an
// absolute URL carrying no query string of its own (so the `?` vs `&` separator
// branch is exercised) and, on the second page, `image: false` — which is what the
// API actually sends when no meta image is set.
const META_IMAGE_URL =
  'https://storage.flyo.cloud/1_RubberDuck0001_quack-driven-development-og-image.jpg';

// Raw pages-endpoint payloads, in the shape the API returns them.
const RAW_PAGES: Record<string, Record<string, unknown>> = {
  '': {
    title: 'Quack-Driven Development',
    slug: '',
    meta_json: {
      title: 'Quack-Driven Development & Other Field Notes',
      description: 'Explain the bug to a small plastic bird until it fixes itself.',
      image: META_IMAGE_URL,
    },
    json: [],
    jsonld: {},
  },
  'no-meta-image': {
    title: 'No Meta Image',
    slug: 'no-meta-image',
    meta_json: { title: 'No Meta Image', description: '', image: false },
    json: [],
    jsonld: {},
  },
};

// Partial mock: the real models (and therefore the real `PageFromJSON`) are kept,
// only the transport classes are replaced. `PagesApi.page()` deserializes the raw
// payload just like the generated client does.
jest.mock('@flyo/nitro-typescript', () => {
  const actual = jest.requireActual('@flyo/nitro-typescript');

  return {
    ...actual,
    Configuration: jest.fn().mockImplementation((config) => ({ ...config })),
    ConfigApi: jest.fn().mockImplementation(() => ({
      config: jest.fn().mockResolvedValue({ pages: ['', 'no-meta-image'] }),
    })),
    PagesApi: jest.fn().mockImplementation(() => ({
      page: jest.fn().mockImplementation(({ slug }: { slug: string }) =>
        Promise.resolve(actual.PageFromJSON(RAW_PAGES[slug])),
      ),
    })),
    EntitiesApi: jest.fn().mockImplementation(() => ({})),
    SitemapApi: jest.fn().mockImplementation(() => ({})),
    SearchApi: jest.fn().mockImplementation(() => ({})),
  };
});

describe('social preview images through the real SDK deserializer', () => {
  // A fresh instance per test: `pageResolveRoute` is wrapped in React `cache()`,
  // so a shared instance would serve the first resolved page to every test.
  const createFlyo = () =>
    initNitro({
      accessToken: 'test-token',
      lang: 'de',
      baseUrl: 'https://example.com',
      components: {},
    });

  it('keeps meta_json.image a string after deserialization', async () => {
    const { PageFromJSON } = jest.requireActual('@flyo/nitro-typescript');
    const page = PageFromJSON(RAW_PAGES['']);

    // The contract `buildSocialImageUrl` relies on. In 1.5.0 this was an object.
    expect(typeof page.meta_json.image).toBe('string');
    expect(page.meta_json.image).toBe(META_IMAGE_URL);
  });

  it('emits og:image and twitter:image in the CDN query format', async () => {
    const generateMetadata = nitroPageGenerateMetadata(createFlyo());
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: [] }) });

    expect(metadata.openGraph?.images).toEqual([`${META_IMAGE_URL}?w=1200&h=630&format=jpg`]);
    expect(metadata.twitter?.images).toEqual([`${META_IMAGE_URL}?w=1200&h=600&format=jpg`]);
  });

  it('never emits an image built from a non-string value', async () => {
    const generateMetadata = nitroPageGenerateMetadata(createFlyo());
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: [] }) });

    const images = metadata.openGraph?.images as string[];

    // Asserted before the loop, so this cannot pass vacuously on an empty list —
    // which is exactly what 1.5.0 produced.
    expect(images).toHaveLength(1);

    // The 1.5.0 failure mode, had the guard been a truthiness check: `{}` is
    // truthy, so it would have produced "[object Object]?w=1200&h=630&format=jpg".
    for (const image of images) {
      expect(image).not.toContain('[object Object]');
      expect(image).toMatch(/^https:\/\//);
    }
  });

  it('emits no social images when the page has no meta image', async () => {
    const generateMetadata = nitroPageGenerateMetadata(createFlyo());
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: ['no-meta-image'] }),
    });

    // `image: false` survives deserialization as a boolean and is skipped —
    // in 1.5.0 it arrived as a truthy `{}`.
    expect(metadata.openGraph?.images).toEqual([]);
    expect(metadata.twitter?.images).toEqual([]);
  });
});

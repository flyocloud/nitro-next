import { nitroPageGenerateMetadata, nitroEntityGenerateMetadata, initNitro } from './server';
import type { Entity } from '@flyo/nitro-typescript';

/**
 * `<meta name="robots" content="noindex">` for content the API flags as
 * non-indexable.
 *
 * `is_indexable` is not access control: such a page is delivered like any other
 * and stays reachable by URL, it is only kept out of the sitemap and the search
 * endpoint — so telling the crawlers is entirely up to the consumer. The pages
 * endpoint sends `0`/`1`, the entities endpoint a boolean, and an entity draft
 * link is always non-indexable.
 *
 * Run through the **real** `PageFromJSON()` (only the transport classes are
 * mocked), so an SDK release dropping `is_indexable` during deserialization
 * fails here rather than silently letting a noindex page into the indexes.
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

// Raw pages-endpoint payloads, in the shape the API returns them.
const RAW_PAGES: Record<string, Record<string, unknown>> = {
  indexable: {
    title: 'Indexable',
    slug: 'indexable',
    href: '/indexable',
    is_indexable: 1,
    meta_json: { title: 'Indexable', description: '', image: false },
    json: [],
  },
  'thank-you': {
    title: 'Thank you',
    slug: 'thank-you',
    href: '/thank-you',
    is_indexable: 0,
    meta_json: { title: 'Thank you', description: '', image: false },
    json: [],
  },
  // An older API response, from before the flag existed.
  'no-flag': {
    title: 'No Flag',
    slug: 'no-flag',
    href: '/no-flag',
    meta_json: { title: 'No Flag', description: '', image: false },
    json: [],
  },
};

jest.mock('@flyo/nitro-typescript', () => {
  const actual = jest.requireActual('@flyo/nitro-typescript');

  return {
    ...actual,
    Configuration: jest.fn().mockImplementation((config) => ({ ...config })),
    ConfigApi: jest.fn().mockImplementation(() => ({
      config: jest.fn().mockResolvedValue({ pages: Object.keys(RAW_PAGES) }),
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

// A fresh instance per call: `pageResolveRoute` is wrapped in React `cache()`,
// so a shared instance would serve the first resolved page to every test.
const createFlyo = () =>
  initNitro({
    accessToken: 'test-token',
    lang: 'en',
    baseUrl: 'https://example.com',
  });

const metadataFor = (slug: string[]) =>
  nitroPageGenerateMetadata(createFlyo())({ params: Promise.resolve({ slug }) });

describe('robots meta on a Nitro page', () => {
  it('emits noindex for a page flagged is_indexable: 0', async () => {
    const metadata = await metadataFor(['thank-you']);

    expect(metadata.robots).toEqual({ index: false });
  });

  it('emits no robots tag for an indexable page', async () => {
    const metadata = await metadataFor(['indexable']);

    expect(metadata.robots).toBeUndefined();
  });

  it('emits no robots tag when the API sends no flag at all', async () => {
    const metadata = await metadataFor(['no-flag']);

    expect(metadata.robots).toBeUndefined();
  });

  it('leaves the rest of the metadata intact on a noindex page', async () => {
    const metadata = await metadataFor(['thank-you']);

    expect(metadata.title).toBe('Thank you');
    expect(metadata.alternates?.canonical).toBe('https://example.com/thank-you');
  });
});

describe('robots meta on an entity detail page', () => {
  const entityMetadataFor = (entity: Entity) =>
    nitroEntityGenerateMetadata(createFlyo(), { resolver: async () => entity })({
      params: Promise.resolve({ slug: 'a-duck' }),
    });

  it('emits noindex for an entity flagged is_indexable: false', async () => {
    const metadata = await entityMetadataFor({
      entity: { entity_title: 'A duck' },
      language: 'en',
      is_indexable: false,
    } as unknown as Entity);

    expect(metadata.robots).toEqual({ index: false });
  });

  it('emits no robots tag for an indexable entity', async () => {
    const metadata = await entityMetadataFor({
      entity: { entity_title: 'A duck' },
      language: 'en',
      is_indexable: true,
    } as unknown as Entity);

    expect(metadata.robots).toBeUndefined();
  });

  // Drafts are always non-indexable, so a shared draft link stays out of the
  // indexes even though it resolves like any other entity.
  it('emits noindex for a draft link', async () => {
    const metadata = await entityMetadataFor({
      entity: { entity_title: 'A duck' },
      language: 'en',
      is_draft: true,
      is_indexable: false,
    } as unknown as Entity);

    expect(metadata.robots).toEqual({ index: false });
  });

  it('emits no robots tag when the API sends no flag at all', async () => {
    const metadata = await entityMetadataFor({
      entity: { entity_title: 'A duck' },
      language: 'en',
    } as unknown as Entity);

    expect(metadata.robots).toBeUndefined();
  });
});

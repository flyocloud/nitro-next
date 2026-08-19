import { nitroPageGenerateMetadata, nitroEntityGenerateMetadata, initNitro } from './server';
import type { Entity } from '@flyo/nitro-typescript';

/**
 * The canonical URL a page's `<head>` carries.
 *
 * A canonical used to exist only on multilingual sites, where it fell out of
 * `translation[]` as a side effect of building the hreflang links — a
 * single-language site emitted none at all. The pages endpoint resolves every
 * page's own address into `page.href` (`/about-me`), so it can be the
 * self-referencing canonical for *every* page.
 *
 * Run through the **real** `PageFromJSON()` (only the transport classes are
 * mocked), so a future SDK release dropping `href` during deserialization fails
 * here rather than silently removing the tag — the 2.8.1 `og:image` failure mode
 * (see `server.metaimage.test.tsx`).
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

// Raw pages-endpoint payloads, in the shape the API returns them. `href` is the
// completed link the API resolves for the page; the multilingual ones also carry
// the `translation[]` the hreflang links come from.
const TRANSLATIONS = [
  { language: { shortcode: 'de', name: 'Deutsch' }, slug: 'de/ueber-uns', title: 'Über uns', href: '/de/ueber-uns' },
  { language: { shortcode: 'en', name: 'English' }, slug: 'en/about-us', title: 'About us', href: '/en/about-us' },
];

const RAW_PAGES: Record<string, Record<string, unknown>> = {
  '': {
    title: 'Home',
    slug: '',
    href: '/',
    meta_json: { title: 'Home', description: '', image: false },
    json: [],
  },
  'about-me': {
    title: 'About me',
    slug: 'about-me',
    href: '/about-me',
    meta_json: { title: 'About me', description: 'Field notes', image: false },
    json: [],
  },
  'no-leading-slash': {
    title: 'No Leading Slash',
    slug: 'no-leading-slash',
    href: 'no-leading-slash',
    meta_json: { title: 'No Leading Slash', description: '', image: false },
    json: [],
  },
  'absolute-href': {
    title: 'Absolute Href',
    slug: 'absolute-href',
    href: 'https://shop.example.com/campaign',
    meta_json: { title: 'Absolute Href', description: '', image: false },
    json: [],
  },
  // A page of `type: 'email'` — its href is a mailto target, not a document URL.
  'mail-link': {
    title: 'Mail Link',
    slug: 'mail-link',
    type: 'email',
    href: 'mailto:hello@flyo.ch',
    meta_json: { title: 'Mail Link', description: '', image: false },
    json: [],
  },
  'blank-href': {
    title: 'Blank Href',
    slug: 'blank-href',
    href: '   ',
    meta_json: { title: 'Blank Href', description: '', image: false },
    json: [],
  },
  // An older API response, before `href` was resolved server-side.
  'no-href': {
    title: 'No Href',
    slug: 'no-href',
    meta_json: { title: 'No Href', description: '', image: false },
    json: [],
  },
  'en/about-us': {
    title: 'About us',
    slug: 'en/about-us',
    href: '/en/about-us',
    meta_json: { title: 'About us', description: '', image: false },
    json: [],
    translation: TRANSLATIONS,
  },
  // Multilingual, but the API sent no translation for the locale being rendered.
  'en/untranslated': {
    title: 'Untranslated',
    slug: 'en/untranslated',
    href: '/en/untranslated',
    meta_json: { title: 'Untranslated', description: '', image: false },
    json: [],
    translation: [TRANSLATIONS[0]],
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
const createFlyo = (overrides: Record<string, unknown> = {}) =>
  initNitro({
    accessToken: 'test-token',
    lang: 'en',
    baseUrl: 'https://example.com',
    ...overrides,
  });

const metadataFor = (slug: string[], overrides?: Record<string, unknown>) =>
  nitroPageGenerateMetadata(createFlyo(overrides))({ params: Promise.resolve({ slug }) });

describe('canonical URL on a Nitro page', () => {
  it('emits a self-referencing canonical built from page.href', async () => {
    const metadata = await metadataFor(['about-me']);

    expect(metadata.alternates?.canonical).toBe('https://example.com/about-me');
  });

  it('emits the canonical for the homepage too', async () => {
    const metadata = await metadataFor([]);

    expect(metadata.alternates?.canonical).toBe('https://example.com/');
  });

  it('keeps page.href a string after deserialization', () => {
    const { PageFromJSON } = jest.requireActual('@flyo/nitro-typescript');

    expect(PageFromJSON(RAW_PAGES['about-me']).href).toBe('/about-me');
  });

  it('leaves the canonical relative when no baseUrl is configured', async () => {
    // Next.js then resolves it against `metadataBase`.
    const metadata = await metadataFor(['about-me'], { baseUrl: undefined });

    expect(metadata.alternates?.canonical).toBe('/about-me');
  });

  it('does not double the slash between baseUrl and href', async () => {
    const metadata = await metadataFor(['about-me'], { baseUrl: 'https://example.com/' });

    expect(metadata.alternates?.canonical).toBe('https://example.com/about-me');
  });

  it('adds the missing leading slash to an href sent without one', async () => {
    const metadata = await metadataFor(['no-leading-slash']);

    expect(metadata.alternates?.canonical).toBe('https://example.com/no-leading-slash');
  });

  it('keeps an absolute href as-is instead of prefixing baseUrl', async () => {
    const metadata = await metadataFor(['absolute-href']);

    expect(metadata.alternates?.canonical).toBe('https://shop.example.com/campaign');
  });

  it('emits no canonical for a page whose href is not a document URL', async () => {
    const metadata = await metadataFor(['mail-link']);

    expect(metadata.alternates).toBeUndefined();
  });

  it('emits no canonical for a blank href', async () => {
    const metadata = await metadataFor(['blank-href']);

    expect(metadata.alternates).toBeUndefined();
  });

  it('emits no canonical when the API sends no href at all', async () => {
    const metadata = await metadataFor(['no-href']);

    expect(metadata.alternates).toBeUndefined();
  });

  it('leaves the rest of the metadata untouched', async () => {
    const metadata = await metadataFor(['about-me']);

    expect(metadata.title).toBe('About me');
    expect(metadata.description).toBe('Field notes');
    expect(metadata.openGraph?.title).toBe('About me');
  });
});

describe('canonical URL alongside hreflang links', () => {
  const multilingual = { lang: 'de', locales: ['de', 'en'], defaultLocale: 'de' };

  it('takes the canonical from the translation of the active locale', async () => {
    const metadata = await metadataFor(['en', 'about-us'], multilingual);

    expect(metadata.alternates?.canonical).toBe('https://example.com/en/about-us');
  });

  it('emits every translation as a fully qualified hreflang link', async () => {
    const metadata = await metadataFor(['en', 'about-us'], multilingual);

    expect(metadata.alternates?.languages).toEqual({
      de: 'https://example.com/de/ueber-uns',
      en: 'https://example.com/en/about-us',
    });
  });

  it('keeps the hreflang links relative when no baseUrl is configured', async () => {
    const metadata = await metadataFor(['en', 'about-us'], { ...multilingual, baseUrl: undefined });

    expect(metadata.alternates?.languages).toEqual({
      de: '/de/ueber-uns',
      en: '/en/about-us',
    });
  });

  it('falls back to page.href when no translation matches the active locale', async () => {
    const metadata = await metadataFor(['en', 'untranslated'], multilingual);

    expect(metadata.alternates?.canonical).toBe('https://example.com/en/untranslated');
    expect(metadata.alternates?.languages).toEqual({ de: 'https://example.com/de/ueber-uns' });
  });
});

describe('canonical URL on an entity detail page', () => {
  // The entities endpoint carries no `href`, so an entity's canonical can only
  // come from its translations.
  const entityMetadataFor = (entity: Entity) =>
    nitroEntityGenerateMetadata(createFlyo(), { resolver: async () => entity })({
      params: Promise.resolve({ slug: 'a-duck' }),
    });

  it('takes the canonical from the translation of the entity language', async () => {
    const metadata = await entityMetadataFor({
      entity: { entity_title: 'A duck' },
      language: 'en',
      translation: TRANSLATIONS,
    } as unknown as Entity);

    expect(metadata.alternates?.canonical).toBe('https://example.com/en/about-us');
  });

  it('emits no alternates for an entity without translations', async () => {
    const metadata = await entityMetadataFor({
      entity: { entity_title: 'A duck' },
      language: 'en',
    } as unknown as Entity);

    expect(metadata.alternates).toBeUndefined();
  });
});

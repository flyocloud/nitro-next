/**
 * Regression tests for the language-links server store on `notFound()` paths:
 * the route helpers must settle the store with a fallback on *every* bail-out,
 * so a `NitroLanguageSwitcher` in shared chrome (a footer in the root layout)
 * resolves instead of hanging — and the fallback is published by the route
 * itself, never by `not-found.tsx` (which the App Router also renders on 200s
 * and would race).
 *
 * The store is internal in v2.3, so these tests read it the way production
 * code does: through `NitroLanguageSwitcher`, whose resolved inner component
 * receives the awaited links as `initial`.
 *
 * At runtime Next.js scopes React `cache()` per request, so the layout and the
 * page see the *same* store instance. Jest has no request scope, so jest.setup.js
 * stands in for `cache()` with a memoizer created per module load; loading
 * `./server` fresh per test (`jest.isolateModules`) then reproduces that
 * shared-per-request store.
 */
import type { Entity } from '@flyo/nitro-typescript';

jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  usePathname: jest.fn(() => '/'),
}));

jest.mock('next/headers', () => ({
  headers: jest.fn(async () => ({ get: () => null })),
}));

jest.mock('@flyo/nitro-typescript', () => ({
  Configuration: jest.fn().mockImplementation((config) => ({ ...config })),
  ConfigApi: jest.fn().mockImplementation(() => ({
    config: jest.fn().mockResolvedValue({ pages: ['', 'about'] }),
  })),
  PagesApi: jest.fn().mockImplementation(() => ({
    page: jest.fn().mockRejectedValue(new Error('Page not found')),
  })),
  EntitiesApi: jest.fn(),
  SitemapApi: jest.fn(),
  SearchApi: jest.fn(),
}));

function loadServer() {
  let mod!: typeof import('./server');
  jest.isolateModules(() => {
    mod = require('./server');
  });
  return mod;
}

/**
 * Await the store through the public path: `NitroLanguageSwitcher` returns
 * `<Suspense>` around an async inner component; invoking that inner component
 * (the way React does) resolves once the route has published, and its client
 * half receives the links as the `initial` prop.
 */
async function readPublishedLinks(mod: typeof import('./server')) {
  const switcher = mod.NitroLanguageSwitcher({ default: [] });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inner = (switcher as any).props.children;
  const bridge = await inner.type(inner.props);
  return bridge.props.initial;
}

describe('route helpers settle the language-links store on notFound paths', () => {
  // The page-fetch-failure path logs via console.error by design; keep it out of
  // the test output.
  let errorSpy: jest.SpyInstance;
  beforeAll(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterAll(() => {
    errorSpy.mockRestore();
  });

  it('pageResolveRoute settles the store before notFound for an unknown page', async () => {
    const mod = loadServer();
    const flyo = mod.initNitro({ accessToken: 't', defaultLocale: 'de', locales: ['de', 'en'] });

    await expect(
      flyo.pageResolveRoute({ params: Promise.resolve({ slug: ['does-not-exist'] }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');

    // The footer's switcher resolves (no hang) with an empty publish — the
    // bridge then renders its `default` entries.
    await expect(readPublishedLinks(mod)).resolves.toEqual([]);
  });

  it('pageResolveRoute publishes a fallback when the page fetch fails', async () => {
    const mod = loadServer();
    // `about` is in the config, so the code reaches the failing PagesApi.page().
    const flyo = mod.initNitro({ accessToken: 't', defaultLocale: 'en', locales: ['en', 'de'] });

    await expect(
      flyo.pageResolveRoute({ params: Promise.resolve({ slug: ['about'] }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');

    await expect(readPublishedLinks(mod)).resolves.toEqual([]);
  });

  it('entity route publishes a fallback before notFound when the entity is missing', async () => {
    const mod = loadServer();
    const flyo = mod.initNitro({ accessToken: 't', defaultLocale: 'de', locales: ['de', 'en'] });
    const route = mod.nitroEntityRoute(flyo, { resolver: async () => null as unknown as Entity });

    await expect(route({ params: Promise.resolve({}) })).rejects.toThrow('NEXT_NOT_FOUND');

    await expect(readPublishedLinks(mod)).resolves.toEqual([]);
  });

  it('entity route publishes a fallback when the resolver throws, then rethrows the original error', async () => {
    const mod = loadServer();
    const flyo = mod.initNitro({ accessToken: 't', defaultLocale: 'en', locales: ['en', 'de'] });
    const boom = new Error('CMS returned 404');
    const route = mod.nitroEntityRoute(flyo, {
      resolver: async () => {
        throw boom;
      },
    });

    // The original error is preserved (not swallowed / not replaced by notFound).
    await expect(route({ params: Promise.resolve({}) })).rejects.toBe(boom);

    await expect(readPublishedLinks(mod)).resolves.toEqual([]);
  });

  it('NitroLanguageLinks settles the server store and renders the client publisher', async () => {
    const mod = loadServer();
    const links = [
      { shortcode: 'de', name: 'Deutsch', href: '/de/galerie', title: undefined, isCurrent: true, exists: true },
      { shortcode: 'en', name: 'English', href: '/en/gallery', title: undefined, isCurrent: false, exists: true },
    ];

    // Invoked as a plain function, the way React runs a server component. It
    // must publish synchronously (settling the switcher in the footer) and
    // hand the same links to the client publisher for soft navigations.
    const element = mod.NitroLanguageLinks({ links });

    await expect(readPublishedLinks(mod)).resolves.toEqual(links);
    expect(element.props.links).toEqual(links);
  });

  it('entity route publishes the resolved translations on success', async () => {
    const mod = loadServer();
    const flyo = mod.initNitro({ accessToken: 't', defaultLocale: 'de', locales: ['de', 'en'] });
    const entity = {
      language: 'de',
      translation: [
        { language: { shortcode: 'de', name: 'Deutsch' }, href: '/de/x', title: 'DE' },
        { language: { shortcode: 'en', name: 'Englisch' }, href: '/en/x', title: 'EN' },
      ],
    } as unknown as Entity;
    const route = mod.nitroEntityRoute(flyo, { resolver: async () => entity });

    await route({ params: Promise.resolve({}) });

    await expect(readPublishedLinks(mod)).resolves.toEqual([
      { shortcode: 'de', name: 'Deutsch', href: '/de/x', title: 'DE', isCurrent: true, exists: true },
      { shortcode: 'en', name: 'Englisch', href: '/en/x', title: 'EN', isCurrent: false, exists: true },
    ]);
  });

  it('keeps the first published value (first publish wins)', async () => {
    // The guard behind the "never publish from not-found.tsx" rule: a route's
    // real links, published first, cannot be overwritten by later writers.
    const mod = loadServer();
    const first = [
      { shortcode: 'de', name: 'Deutsch', href: '/de/a', title: undefined, isCurrent: true, exists: true },
    ];
    const second = [
      { shortcode: 'de', name: 'Deutsch', href: '/de/b', title: undefined, isCurrent: true, exists: true },
    ];

    mod.NitroLanguageLinks({ links: first });
    mod.NitroLanguageLinks({ links: second });

    await expect(readPublishedLinks(mod)).resolves.toEqual(first);
  });

  it('threads a custom component through to the client half', async () => {
    const mod = loadServer();
    const MySwitcher = () => null;

    mod.NitroLanguageLinks({ links: [] }); // settle the store

    const switcher = mod.NitroLanguageSwitcher({ default: [], component: MySwitcher });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inner = (switcher as any).props.children;
    const bridge = await inner.type(inner.props);
    expect(bridge.props.component).toBe(MySwitcher);
  });

  it('single-language: a successful route publishes an empty list (no translations reach the switcher)', async () => {
    const mod = loadServer();
    // `lang` only → one locale → not multilingual. Even though the entity HAS
    // translations, the store settles with [] (not a disabled-locale stub).
    const flyo = mod.initNitro({ accessToken: 't', lang: 'en' });
    const entity = {
      language: 'en',
      translation: [
        { language: { shortcode: 'en', name: 'English' }, href: '/x', title: 'X' },
      ],
    } as unknown as Entity;
    const route = mod.nitroEntityRoute(flyo, { resolver: async () => entity });

    await route({ params: Promise.resolve({}) });

    await expect(readPublishedLinks(mod)).resolves.toEqual([]);
  });

});

/**
 * Regression tests for the v2.2 language-switcher bug: the request-scoped
 * language-links store must be settled with a fallback on *every* `notFound()`
 * path of the route helpers, so a switcher rendered in shared chrome (a footer
 * in the root layout) awaiting `readLanguageLinks()` resolves instead of
 * hanging — and so the fallback is published by the route itself, never by
 * `not-found.tsx` (which the App Router also renders on 200s and would race).
 *
 * At runtime Next.js scopes React `cache()` per request, so the layout and the
 * page see the *same* store instance. Jest has no request scope, so here we mock
 * `cache()` with a per-module memoizer and load `./server` fresh per test
 * (`jest.isolateModules`) to reproduce that shared-per-request store.
 */
import type { Entity } from '@flyo/nitro-typescript';

// Memoize `cache(fn)` by argument identity, once per module load. Combined with
// `jest.isolateModules` below this gives each test one fresh store shared
// between `publishLanguageLinks` (inside the route) and `readLanguageLinks`.
jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cache: (fn: (...args: any[]) => any) => {
      const memo = new Map<string, unknown>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (...args: any[]) => {
        const key = JSON.stringify(args);
        if (!memo.has(key)) {
          memo.set(key, fn(...args));
        }
        return memo.get(key);
      };
    },
  };
});

jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
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

const disabledFallback = (shortcode: string, isCurrent: boolean) => ({
  shortcode,
  name: undefined,
  href: null,
  title: undefined,
  isCurrent,
  exists: false,
});

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

  it('pageResolveRoute publishes a disabled fallback before notFound for an unknown page', async () => {
    const { initNitro, readLanguageLinks } = loadServer();
    const flyo = initNitro({ accessToken: 't', defaultLocale: 'de', locales: ['de', 'en'] });

    await expect(
      flyo.pageResolveRoute({ params: Promise.resolve({ slug: ['does-not-exist'] }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');

    // The footer's read resolves (no hang) with a fallback entry per locale.
    await expect(readLanguageLinks()).resolves.toEqual([
      disabledFallback('de', true),
      disabledFallback('en', false),
    ]);
  });

  it('pageResolveRoute publishes a fallback when the page fetch fails', async () => {
    const { initNitro, readLanguageLinks } = loadServer();
    // `about` is in the config, so the code reaches the failing PagesApi.page().
    const flyo = initNitro({ accessToken: 't', defaultLocale: 'en', locales: ['en', 'de'] });

    await expect(
      flyo.pageResolveRoute({ params: Promise.resolve({ slug: ['about'] }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');

    await expect(readLanguageLinks()).resolves.toEqual([
      disabledFallback('en', true),
      disabledFallback('de', false),
    ]);
  });

  it('entity route publishes a fallback before notFound when the entity is missing', async () => {
    const { initNitro, nitroEntityRoute, readLanguageLinks } = loadServer();
    const flyo = initNitro({ accessToken: 't', defaultLocale: 'de', locales: ['de', 'en'] });
    const route = nitroEntityRoute(flyo, { resolver: async () => null as unknown as Entity });

    await expect(route({ params: Promise.resolve({}) })).rejects.toThrow('NEXT_NOT_FOUND');

    await expect(readLanguageLinks()).resolves.toEqual([
      disabledFallback('de', true),
      disabledFallback('en', false),
    ]);
  });

  it('entity route publishes a fallback when the resolver throws, then rethrows the original error', async () => {
    const { initNitro, nitroEntityRoute, readLanguageLinks } = loadServer();
    const flyo = initNitro({ accessToken: 't', defaultLocale: 'en', locales: ['en', 'de'] });
    const boom = new Error('CMS returned 404');
    const route = nitroEntityRoute(flyo, {
      resolver: async () => {
        throw boom;
      },
    });

    // The original error is preserved (not swallowed / not replaced by notFound).
    await expect(route({ params: Promise.resolve({}) })).rejects.toBe(boom);

    await expect(readLanguageLinks()).resolves.toEqual([
      disabledFallback('en', true),
      disabledFallback('de', false),
    ]);
  });

  it('entity route publishes the resolved translations on success', async () => {
    const { initNitro, nitroEntityRoute, readLanguageLinks } = loadServer();
    const flyo = initNitro({ accessToken: 't', defaultLocale: 'de', locales: ['de', 'en'] });
    const entity = {
      language: 'de',
      translation: [
        { language: { shortcode: 'de', name: 'Deutsch' }, href: '/de/x', title: 'DE' },
        { language: { shortcode: 'en', name: 'Englisch' }, href: '/en/x', title: 'EN' },
      ],
    } as unknown as Entity;
    const route = nitroEntityRoute(flyo, { resolver: async () => entity });

    await route({ params: Promise.resolve({}) });

    await expect(readLanguageLinks()).resolves.toEqual([
      { shortcode: 'de', name: 'Deutsch', href: '/de/x', title: 'DE', isCurrent: true, exists: true },
      { shortcode: 'en', name: 'Englisch', href: '/en/x', title: 'EN', isCurrent: false, exists: true },
    ]);
  });
});

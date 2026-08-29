import { createProxy } from './proxy';
import { initNitro } from './server';
import type { NextRequest } from 'next/server';

jest.mock('@flyo/nitro-js-bridge', () => ({
  highlightAndClick: jest.fn(),
  wysiwyg: jest.fn(() => ''),
  reload: jest.fn(),
  scrollTo: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  notFound: jest.fn(),
  redirect: jest.fn(),
  usePathname: jest.fn(() => '/'),
}));

jest.mock('next/headers', () => ({
  headers: jest.fn(async () => ({ get: () => null })),
}));

jest.mock('@flyo/nitro-typescript', () => ({
  Configuration: jest.fn().mockImplementation((config) => ({ ...config })),
  ConfigApi: jest.fn().mockImplementation(() => ({})),
  PagesApi: jest.fn().mockImplementation(() => ({})),
  EntitiesApi: jest.fn().mockImplementation(() => ({})),
  SitemapApi: jest.fn().mockImplementation(() => ({})),
  SearchApi: jest.fn().mockImplementation(() => ({})),
}));

// The real `next/server` reaches for the edge runtime's `Request`, which jsdom
// does not provide. Only `NextResponse.next()` is exercised here, and all it has
// to do is remember the request headers it was handed.
const requestInit: { headers?: Headers } = {};

jest.mock('next/server', () => ({
  NextResponse: {
    next: jest.fn((init?: { request?: { headers?: Headers } }) => {
      requestInit.headers = init?.request?.headers;
      return { headers: new Headers() };
    }),
  },
}));

/** Minimal stand-in for the parts of `NextRequest` the proxy touches. */
function request(url: string): NextRequest {
  return { nextUrl: new URL(url, 'https://example.com'), headers: new Headers() } as unknown as NextRequest;
}

function run(flyo: ReturnType<typeof initNitro>, url: string, options = {}) {
  const res = createProxy(flyo, options)(request(url));
  return {
    cacheControl: res.headers.get('Cache-Control'),
    cdn: res.headers.get('CDN-Cache-Control'),
    vercelCdn: res.headers.get('Vercel-CDN-Cache-Control'),
    requestHeaders: requestInit.headers!,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  requestInit.headers = undefined;
});

describe('createProxy cache headers', () => {
  it('serves published content with the configured TTLs', () => {
    const flyo = initNitro({ accessToken: 't', serverCacheTtl: 1200, clientCacheTtl: 900 });
    const res = run(flyo, '/tiere/hund');

    expect(res.cacheControl).toBe('max-age=900');
    expect(res.cdn).toBe('max-age=1200');
    expect(res.vercelCdn).toBe('max-age=1200');
  });

  it('takes a marked draft URL out of the browser and CDN cache', () => {
    const flyo = initNitro({ accessToken: 't' });
    const res = run(flyo, '/tiere/token?flyo-draft=1');

    expect(res.cacheControl).toBe('no-store');
    expect(res.cdn).toBe('no-store');
    expect(res.vercelCdn).toBe('no-store');
  });

  it('honours a custom marker name and ignores the default one', () => {
    const flyo = initNitro({ accessToken: 't', draftUrlMarker: 'preview' });

    expect(run(flyo, '/tiere/token?preview=1').cacheControl).toBe('no-store');
    expect(run(flyo, '/tiere/token?flyo-draft=1').cacheControl).toBe('max-age=900');
  });

  it('ignores the marker entirely when marking is switched off', () => {
    const flyo = initNitro({ accessToken: 't', draftUrlMarker: false });

    expect(run(flyo, '/tiere/token?flyo-draft=1').cacheControl).toBe('max-age=900');
  });

  it('lets isDraftRequest replace the detection', () => {
    const flyo = initNitro({ accessToken: 't' });
    const isDraftRequest = (req: NextRequest) => req.nextUrl.pathname.startsWith('/preview/');

    expect(run(flyo, '/preview/token', { isDraftRequest }).cacheControl).toBe('no-store');
    // The default marker no longer applies once detection is replaced.
    expect(run(flyo, '/tiere/token?flyo-draft=1', { isDraftRequest }).cacheControl).toBe('max-age=900');
  });

  it('still disables caching entirely in live edit mode', () => {
    const flyo = initNitro({ accessToken: 't', liveEdit: true });

    expect(run(flyo, '/tiere/hund').cacheControl).toBe('no-store');
    expect(run(flyo, '/tiere/hund').cdn).toBe('no-store');
  });
});

describe('createProxy request headers', () => {
  it('hands the current path to the render on every request', () => {
    const flyo = initNitro({ accessToken: 't' });

    expect(run(flyo, '/tiere/hund').requestHeaders.get('x-flyo-path')).toBe('/tiere/hund');
    expect(run(flyo, '/tiere/token?a=1&b=2').requestHeaders.get('x-flyo-path')).toBe('/tiere/token?a=1&b=2');
  });

  it('flags a marked request so the render stops redirecting', () => {
    const flyo = initNitro({ accessToken: 't' });

    expect(run(flyo, '/tiere/token?flyo-draft=1').requestHeaders.get('x-flyo-draft')).toBe('1');
    expect(run(flyo, '/tiere/hund').requestHeaders.get('x-flyo-draft')).toBeNull();
  });

  it('drops a draft flag a client tried to send itself', () => {
    const flyo = initNitro({ accessToken: 't' });
    const forged = { nextUrl: new URL('https://example.com/tiere/hund'), headers: new Headers({ 'x-flyo-draft': '1' }) };

    createProxy(flyo)(forged as unknown as NextRequest);

    expect(requestInit.headers!.get('x-flyo-draft')).toBeNull();
  });

  it('keeps setting the locale header', () => {
    const flyo = initNitro({ accessToken: 't', locales: ['de', 'en'], defaultLocale: 'de' });

    expect(run(flyo, '/en/animals').requestHeaders.get('x-flyo-locale')).toBe('en');
    expect(run(flyo, '/tiere').requestHeaders.get('x-flyo-locale')).toBe('de');
  });
});

/**
 * Regression tests for the 404-vs-error split on entity detail routes.
 *
 * `entityBySlug()` / `entityByUniqueid()` never resolve to `null` for an
 * unknown slug: the API answers HTTP 404 and the generated client rejects with
 * a `ResponseError` carrying the raw `Response`. Before v2.11 the route helpers
 * rethrew that, so the most ordinary case of all — a link to content that no
 * longer exists — rendered an error page (HTTP 500) instead of the 404 it is.
 *
 * The other half of the contract matters just as much: every *other* failure
 * (a 401 from a wrong access token, a 500, a network error) must stay an error.
 * Answering an outage with `notFound()` would soft-404 the whole site while the
 * API is merely unreachable.
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
  ConfigApi: jest.fn(),
  PagesApi: jest.fn(),
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

/** How the generated client rejects a non-2xx response. */
const responseError = (status: number) => ({
  name: 'ResponseError',
  response: { status },
});

describe('isApiNotFound', () => {
  const { isApiNotFound } = loadServer();

  it('recognizes the generated client rejecting a 404', () => {
    expect(isApiNotFound(responseError(404))).toBe(true);
  });

  it('recognizes a bare `status` too, for hand-rolled fetch wrappers', () => {
    expect(isApiNotFound({ status: 404 })).toBe(true);
  });

  it.each([
    ['a 500', responseError(500)],
    ['a 401', responseError(401)],
    ['a 403', responseError(403)],
    ['a network failure', new Error('fetch failed')],
    ['a thrown string', 'nope'],
    ['null', null],
    ['undefined', undefined],
    // What `notFound()` itself throws: a digest, never a status.
    ['the App Router not-found digest', { digest: 'NEXT_HTTP_ERROR_FALLBACK;404' }],
  ])('does not mistake %s for a 404', (_label, error) => {
    expect(isApiNotFound(error)).toBe(false);
  });
});

describe('entity routes turn a CMS 404 into a real 404', () => {
  const rejectingResolver = (error: unknown) => async () => {
    throw error;
  };

  it('nitroEntityRoute renders not-found when the entity does not exist', async () => {
    const mod = loadServer();
    const flyo = mod.initNitro({ accessToken: 't', lang: 'en' });
    const route = mod.nitroEntityRoute(flyo, { resolver: rejectingResolver(responseError(404)) });

    await expect(route({ params: Promise.resolve({ slug: 'gone' }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('nitroEntityGenerateMetadata renders not-found for the same miss', async () => {
    // Next.js runs generateMetadata for the same request; it must not throw a
    // different kind of failure than the page component.
    const mod = loadServer();
    const flyo = mod.initNitro({ accessToken: 't', lang: 'en' });
    const generateMetadata = mod.nitroEntityGenerateMetadata(flyo, {
      resolver: rejectingResolver(responseError(404)),
    });

    await expect(generateMetadata({ params: Promise.resolve({ slug: 'gone' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
  });

  it('accepts a resolver that returns null, without a cast', async () => {
    const mod = loadServer();
    const flyo = mod.initNitro({ accessToken: 't', lang: 'en' });
    // `EntityResolver` allows `null | undefined`, so this compiles as written —
    // the type no longer has to lie about the runtime contract.
    const route = mod.nitroEntityRoute(flyo, { resolver: async () => null });

    await expect(route({ params: Promise.resolve({ slug: 'gone' }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it.each([
    ['a 500 from the API', responseError(500)],
    ['a 401 from a wrong access token', responseError(401)],
    ['a network failure', new Error('fetch failed')],
  ])('keeps %s a real error', async (_label, error) => {
    const mod = loadServer();
    const flyo = mod.initNitro({ accessToken: 't', lang: 'en' });
    const route = mod.nitroEntityRoute(flyo, { resolver: rejectingResolver(error) });

    await expect(route({ params: Promise.resolve({ slug: 'x' }) })).rejects.toBe(error);
  });

  it('passes a `notFound()` from inside the resolver through untouched', async () => {
    const mod = loadServer();
    const flyo = mod.initNitro({ accessToken: 't', lang: 'en' });
    const digestError = Object.assign(new Error('NEXT_HTTP_ERROR_FALLBACK'), {
      digest: 'NEXT_HTTP_ERROR_FALLBACK;404',
    });
    const route = mod.nitroEntityRoute(flyo, { resolver: rejectingResolver(digestError) });

    // The App Router reads the digest, so the error object must survive as it is.
    await expect(route({ params: Promise.resolve({}) })).rejects.toBe(digestError);
  });

  it('renders the entity when the resolver succeeds', async () => {
    const mod = loadServer();
    const flyo = mod.initNitro({ accessToken: 't', lang: 'en' });
    const entity = { entity: { entity_title: 'Hello' } } as unknown as Entity;
    const route = mod.nitroEntityRoute(flyo, {
      resolver: async () => entity,
      render: (resolved) => <h1>{resolved.entity?.entity_title}</h1>,
    });

    const element = await route({ params: Promise.resolve({ slug: 'hello' }) });

    expect(JSON.stringify(element)).toContain('Hello');
  });
});

describe('live editing logs why a route 404s', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('warns with the route params while `liveEdit` is on', async () => {
    const mod = loadServer();
    const flyo = mod.initNitro({ accessToken: 't', lang: 'en', liveEdit: true });
    const route = mod.nitroEntityRoute(flyo, {
      resolver: async () => {
        throw responseError(404);
      },
    });

    await expect(route({ params: Promise.resolve({ slug: 'gone' }) })).rejects.toThrow('NEXT_NOT_FOUND');

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[flyo] 404'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('"slug":"gone"'));
  });

  it('stays silent in production, where a 404 is an ordinary answer', async () => {
    const mod = loadServer();
    const flyo = mod.initNitro({ accessToken: 't', lang: 'en' });
    const route = mod.nitroEntityRoute(flyo, {
      resolver: async () => {
        throw responseError(404);
      },
    });

    await expect(route({ params: Promise.resolve({ slug: 'gone' }) })).rejects.toThrow('NEXT_NOT_FOUND');

    expect(warnSpy).not.toHaveBeenCalled();
  });
});

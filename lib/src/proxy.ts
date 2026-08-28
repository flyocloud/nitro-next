import { NextResponse, type NextRequest } from 'next/server';
import type { FlyoInstance } from './server';
import { DRAFT_PATH_HEADER, DRAFT_REQUEST_HEADER, hasDraftMarker } from './draft';

/**
 * Nitro Next.js Proxy Factory
 *
 * Creates a Next.js middleware that handles cache control headers.
 * Uses cache TTL values from the Flyo instance's configuration state.
 *
 * @param flyo The Flyo instance returned by initNitro()
 * @param options Optional overrides, currently only draft detection
 * @returns Next.js middleware function
 *
 * @example
 * ```ts
 * // src/proxy.ts
 * import { createProxy } from '@flyo/nitro-next/proxy';
 * import { flyo } from './flyo.config';
 *
 * export default createProxy(flyo);
 *
 * export const config = {
 *   matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
 * };
 * ```
 */
export function createProxy(
  flyo: FlyoInstance,
  options: {
    /**
     * Decide whether a request is serving a **draft link**, which is answered
     * with `no-store` instead of the configured TTLs.
     *
     * The default reads the `draftUrlMarker` query parameter that a draft render
     * redirects onto (see `enterDraftMode` in `server.tsx`). Override it when
     * draft URLs reach your site in some other shape — a dedicated `/preview`
     * prefix, a preview cookie your own route handler sets, and so on.
     */
    isDraftRequest?: (request: NextRequest) => boolean;
  } = {},
) {
  const { state } = flyo;

  return function proxy(request: NextRequest) {
    // Detect the active locale from the first path segment when it is a
    // configured locale, and expose it to Server Components (layout, config,
    // entity resolvers) via a request header. No rewrite: pages are addressed
    // by their full locale-prefixed slug, which stays intact in the URL.
    const firstSegment = request.nextUrl.pathname.split('/').filter(Boolean)[0];
    const locale = firstSegment && state.locales.includes(firstSegment)
      ? firstSegment
      : (state.defaultLocale ?? undefined);

    // A draft link is only recognisable *after* the Flyo API has answered, deep
    // inside the render — far too late to set a response header. So the render
    // redirects a resolved draft onto this marker, and the second pass through
    // here is the one that gets the cache headers right. See `draft.ts`.
    const isDraftRequest = options.isDraftRequest
      ? options.isDraftRequest(request)
      : hasDraftMarker(request.nextUrl.searchParams, state.draftUrlMarker);

    const requestHeaders = new Headers(request.headers);
    if (locale) {
      requestHeaders.set('x-flyo-locale', locale);
    }

    // Tell the render whether the marker is already on the URL, and what URL to
    // redirect to when it is not. A Server Component has no other way to read
    // the URL it is rendering — and reading these costs nothing unless a draft
    // is actually resolved, which is the only branch that touches `headers()`.
    requestHeaders.set(DRAFT_PATH_HEADER, `${request.nextUrl.pathname}${request.nextUrl.search}`);
    if (isDraftRequest) {
      requestHeaders.set(DRAFT_REQUEST_HEADER, '1');
    } else {
      // Never let a client forge the flag for a URL this proxy did not mark.
      requestHeaders.delete(DRAFT_REQUEST_HEADER);
    }

    const res = NextResponse.next({ request: { headers: requestHeaders } });

    if (state.liveEdit || isDraftRequest) {
      // Development, live edit mode, or a draft preview - no caching. A draft is
      // an expiring snapshot of content that is still offline: it must not sit
      // in a shared CDN cache, and it must not stay in a browser cache after the
      // link has expired.
      res.headers.set('Vercel-CDN-Cache-Control', 'no-store');
      res.headers.set('CDN-Cache-Control', 'no-store');
      res.headers.set('Cache-Control', 'no-store');
    } else {
      // Production with caching enabled
      const cdn = state.serverCacheTtl > 0 ? `max-age=${state.serverCacheTtl}` : 'no-store';
      res.headers.set('Vercel-CDN-Cache-Control', cdn);
      res.headers.set('CDN-Cache-Control', cdn);

      if (state.clientCacheTtl > 0) {
        res.headers.set('Cache-Control', `max-age=${state.clientCacheTtl}`);
      } else {
        res.headers.set('Cache-Control', 'no-store');
      }
    }

    return res;
  };
}


/**
 * Proxy matcher configuration
 * Applies to all routes except Next.js internal routes
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

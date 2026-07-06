import { NextResponse, type NextRequest } from 'next/server';
import type { FlyoInstance } from './server';

/**
 * Nitro Next.js Proxy Factory
 *
 * Creates a Next.js middleware that handles cache control headers.
 * Uses cache TTL values from the Flyo instance's configuration state.
 *
 * @param flyo The Flyo instance returned by initNitro()
 * @returns Next.js middleware function
 *
 * @example
 * ```ts
 * // src/middleware.ts
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
export function createProxy(flyo: FlyoInstance) {
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

    const requestHeaders = new Headers(request.headers);
    if (locale) {
      requestHeaders.set('x-flyo-locale', locale);
    }

    const res = NextResponse.next({ request: { headers: requestHeaders } });

    if (state.liveEdit) {
      // Development or live edit mode - no caching
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

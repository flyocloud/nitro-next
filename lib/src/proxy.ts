import { NextResponse } from 'next/server';
import type { NitroState } from './server';

/**
 * Nitro Next.js Proxy Factory
 * 
 * Creates a Next.js middleware that handles cache control headers.
 * Uses cache TTL values from the Nitro configuration state.
 * 
 * @param state The Nitro state containing cache configuration
 * @returns Next.js middleware function
 * 
 * @example
 * ```ts
 * // src/middleware.ts
 * import { createProxy } from '@flyo/nitro-next/proxy';
 * import { flyoConfig } from './flyo.config';
 * 
 * export default createProxy(flyoConfig());
 * 
 * export const config = {
 *   matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
 * };
 * ```
 * 
 * @example
 * ```ts
 * // flyo.config.tsx
 * export const flyoConfig = initNitro({
 *   accessToken: process.env.FLYO_ACCESS_TOKEN!,
 *   baseUrl: process.env.SITE_URL || 'http://localhost:3000',
 *   liveEdit: process.env.FLYO_LIVE_EDIT === 'true',
 *   serverCacheTtl: 1200, // 20 minutes
 *   clientCacheTtl: 900,  // 15 minutes
 * });
 * ```
 */
export function createProxy(state: NitroState) {
  return function proxy() {
    const res = NextResponse.next();

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

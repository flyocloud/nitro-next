import { NextResponse } from 'next/server';

export interface ProxyConfig {
  /**
   * Enable caching (if false, all caching is disabled)
   * @default true
   */
  enabled?: boolean;
  /**
   * Server/CDN cache TTL in seconds
   * @default 1200
   */
  serverCacheTtl?: number;
  /**
   * Client browser cache TTL in seconds
   * @default 900
   */
  clientCacheTtl?: number;
}

/**
 * Nitro Next.js Proxy Factory
 * 
 * Creates a Next.js middleware that handles cache control headers.
 * 
 * @example
 * ```ts
 * // proxy.ts (project root or src/)
 * import { createProxy } from '@flyo/nitro-next/proxy';
 * 
 * export default createProxy({
 *   enabled: true,
 *   serverCacheTtl: 1200,
 *   clientCacheTtl: 900,
 * });
 * 
 * // Next.js requires config to be defined directly in this file
 * export const config = {
 *   matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
 * };
 * ```
 */
export function createProxy(config: ProxyConfig = {}) {
  const {
    enabled = true,
    serverCacheTtl = 1200,
    clientCacheTtl = 900,
  } = config;

  return function proxy() {
    const res = NextResponse.next();

    // Set cache headers based on configuration
    const cachingDisabled = !enabled;

    if (!cachingDisabled) {
      // Production with caching enabled
      const cdn = serverCacheTtl > 0 ? `max-age=${serverCacheTtl}` : 'no-store';

      res.headers.set('Vercel-CDN-Cache-Control', cdn);
      res.headers.set('CDN-Cache-Control', cdn);

      if (clientCacheTtl > 0) {
        res.headers.set('Cache-Control', `max-age=${clientCacheTtl}`);
      }
    } else {
      // Development or live edit mode - no caching
      res.headers.set('Vercel-CDN-Cache-Control', 'no-store');
      res.headers.set('CDN-Cache-Control', 'no-store');
      res.headers.set('Cache-Control', 'no-store');
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

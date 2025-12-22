/**
 * Nitro Next.js Proxy
 *
 * This file sets up the Nitro proxy for the playground app.
 */

import { createProxy } from '@flyo/nitro-next/proxy';

export default createProxy({
  liveEdit: process.env.FLYO_LIVE_EDIT === 'true',
  serverCacheTtl: 1200,
  clientCacheTtl: 900,
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};



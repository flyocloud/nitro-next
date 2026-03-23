/**
 * Nitro Next.js Proxy
 *
 * This file sets up the Nitro proxy for the playground app.
 */

import { createProxy } from '@flyo/nitro-next/proxy';
import { flyo } from './flyo.config';

export default createProxy(flyo);

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};



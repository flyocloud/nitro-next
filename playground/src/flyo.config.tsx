/**
 * Flyo Configuration
 * 
 * This file creates the Flyo Nitro instance for the app.
 * Import `flyo` from this file wherever you need CMS access.
 */

import type { ReactNode } from 'react';
import { initNitro } from '@flyo/nitro-next/server';
import { FlyoClientWrapper } from '@flyo/nitro-next/client';
import { HeroBanner } from './components/HeroBanner';
import { Text } from './components/Text';

// Get configuration from environment variables
const accessToken = process.env.FLYO_ACCESS_TOKEN || '';
const liveEdit = process.env.NEXT_PUBLIC_FLYO_LIVE_EDIT === 'true';
const baseUrl = process.env.SITE_URL || 'http://localhost:3000';

export const flyo = initNitro({
    accessToken,
    lang: 'en',
    baseUrl,
    liveEdit,
    serverCacheTtl: 1200,
    clientCacheTtl: 900,
    components: {
        HeroBanner,
        Text
    }
});

/**
 * Client wrapper component for live editing support.
 * Wrap your app with this in the root layout.
 */
export function FlyoProvider({ children }: { children: ReactNode }) {
    if (liveEdit) {
        return <FlyoClientWrapper>{children}</FlyoClientWrapper>;
    }
    return <>{children}</>;
}


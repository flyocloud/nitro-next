/**
 * Flyo Configuration
 * 
 * This file configures the Flyo Nitro CMS integration.
 * Import and use FlyoProvider from this file in your layout.
 */

import type { ReactNode } from 'react';
import { initNitro } from '@flyo/nitro-next/server';
import { FlyoClientWrapper } from '@flyo/nitro-next/client';
import { HeroBanner } from './components/HeroBanner';
import { Text } from './components/Text';

// Get configuration from environment variables
const accessToken = process.env.FLYO_ACCESS_TOKEN || '';
const liveEdit = process.env.FLYO_LIVE_EDIT === 'true';


export const flyoConfig = initNitro({
    // API token for authenticating with the Flyo CMS
    accessToken: accessToken,
    // Language code for content retrieval
    lang: 'en',
    // Enable live editing mode - when true, wraps your app with FlyoClientWrapper for real-time content updates
    liveEdit: liveEdit,
    // Map of CMS block types to React components - register all custom components here
    components: {
        HeroBanner: HeroBanner,
        Text: Text
    }
});

/**
 * Pre-configured FlyoProvider component
 * 
 * This component initializes the Flyo Nitro CMS with your configuration.
 * Wrap your app with this component in your root layout.
 */
export function Flyo({ children }: { children: ReactNode }) {

    flyoConfig();

    if (liveEdit) {
        return <FlyoClientWrapper>{children}</FlyoClientWrapper>;
    }

    return children;
}


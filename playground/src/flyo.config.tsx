/**
 * Flyo Configuration
 * 
 * This file configures the Flyo Nitro CMS integration.
 * Import and use FlyoProvider from this file in your layout.
 */

import type { ReactNode } from 'react';
import { initNitro } from '@flyo/nitro-next';
import { HeroBanner } from './components/HeroBanner';

// Get configuration from environment variables
const accessToken = process.env.FLYO_ACCESS_TOKEN || '';


export const flyoConfig = initNitro({
    accessToken: accessToken,
    lang: 'en',
    components: {
        HeroBanner: HeroBanner
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
    
    return children;
}


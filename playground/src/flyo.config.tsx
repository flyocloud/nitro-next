/**
 * Flyo Configuration
 * 
 * This file configures the Flyo Nitro CMS integration.
 * Import and use FlyoProvider from this file in your layout.
 */

import type { ReactNode } from 'react';
import { FlyoProvider } from '@flyo/nitro-next';

// Get configuration from environment variables
const accessToken = process.env.FLYO_ACCESS_TOKEN || '';
const liveEdit = process.env.FLYO_LIVE_EDIT === 'true';

/**
 * Pre-configured FlyoProvider component
 * 
 * This component initializes the Flyo Nitro CMS with your configuration.
 * Wrap your app with this component in your root layout.
 */
export function Flyo({ children }: { children: ReactNode }) {
  return (
    <FlyoProvider 
        accessToken={accessToken} 
        liveEdit={liveEdit}
    >
        {children}
    </FlyoProvider>
    );
}

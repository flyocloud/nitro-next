'use client';

import { createContext, useContext, ReactNode } from 'react';
import { type ConfigResponse } from '@flyo/nitro-typescript';

/**
 * Context for Flyo configuration
 */
const FlyoConfigContext = createContext<ConfigResponse | null>(null);

/**
 * Hook to access the Flyo configuration from any component
 * Must be used within a FlyoProvider
 */
export function useConfig(): ConfigResponse | null {
  const context = useContext(FlyoConfigContext);
  return context;
}

/**
 * Client-side provider component that makes config available via context
 * This receives the config as a prop (typically fetched server-side)
 */
export function FlyoClientProvider({
  children,
  config,
}: {
  children: ReactNode;
  config: ConfigResponse | null;
}) {
  return (
    <FlyoConfigContext.Provider value={config}>
      {children}
    </FlyoConfigContext.Provider>
  );
}

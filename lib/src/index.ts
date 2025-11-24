// Main provider component (server component that fetches config)
export { FlyoProvider, 
  FlyoNitroBlock,
  FlyoNitroPage } from './server';

// Server utilities (use in server-side code or server components)
export { 
  initializeConfiguration, 
  getGlobalConfiguration, 
  getOrFetchConfig,
  getConfig,
  clearConfigCache,
  usePagesApi,
} from './server';

// Client exports - import from '@flyo/nitro-next/client'
// export { useConfig, FlyoClientProvider } from './client';
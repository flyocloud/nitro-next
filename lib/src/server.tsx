import {
  Configuration,
  ConfigApi,
  type ConfigResponse,
  Page,
  Block,
  PagesApi,
} from '@flyo/nitro-typescript';
import { ReactNode } from 'react';

let globalConfiguration: Configuration | null = null;
let globalLang: string = 'de'; // Default language

/**
 * Cached config response to avoid duplicate API calls
 */
let cachedConfig: ConfigResponse | null = null;
let configPromise: Promise<ConfigResponse> | null = null;

/**
 * Initialize the global Configuration instance with an access token and language
 * This should be called before any API requests
 */
export function initializeConfiguration(accessToken: string, lang: string = 'de'): void {
  if (!globalConfiguration) {
    globalConfiguration = new Configuration({
      apiKey: accessToken,
    });
    globalLang = lang;
  }
}

/**
 * Get the global Configuration instance
 * Throws an error if not initialized
 */
export function getGlobalConfiguration(): Configuration {
  if (!globalConfiguration) {
    throw new Error('Configuration must be initialized before use. Call initializeConfiguration first.');
  }
  return globalConfiguration;
}

/**
 * Fetch or return cached configuration
 * Automatically handles concurrent requests and caching
 * 
 * @param lang - Optional language code for localized config (uses global lang if not provided)
 * @returns Promise resolving to the configuration response
 */
export async function getOrFetchConfig(lang?: string): Promise<ConfigResponse> {
  // If we already have a cached config, return it
  // Note: Language-specific caching could be added if needed
  if (cachedConfig) {
    return cachedConfig;
  }

  // If there's already a fetch in progress, wait for it
  if (configPromise) {
    return configPromise;
  }

  // Start a new fetch
  const configApi = new ConfigApi(getGlobalConfiguration());
  const useLang = lang || globalLang;

  configPromise = configApi.config({ lang: useLang }).then((config) => {
    cachedConfig = config;
    configPromise = null;
    return config;
  }).catch((error) => {
    configPromise = null;
    throw error;
  });

  return configPromise;
}

/**
 * Clear the cached configuration
 * Useful for testing or when config needs to be refreshed
 */
export function clearConfigCache(): void {
  cachedConfig = null;
  configPromise = null;
}

/**
 * Get configuration in server components
 * Returns cached config if available, otherwise fetches it
 * Uses the globally configured language from FlyoProvider
 * 
 * Usage in server components:
 * ```tsx
 * import { getConfig } from '@flyo/nitro-next/server';
 * 
 * export default async function Page() {
 *   const config = await getConfig();
 *   return <div>{config?.nitro?.domain}</div>;
 * }
 * ```
 * 
 * @returns Promise resolving to the configuration response
 */
export async function getConfig(): Promise<ConfigResponse> {
  if (cachedConfig) {
    return cachedConfig;
  }
  return await getOrFetchConfig();
}

export function usePagesApi(): PagesApi {
  return new PagesApi(getGlobalConfiguration());
}

/**
 * Server component that fetches config and provides it to client components
 * This should be used in your root layout (server component)
 */
export async function FlyoProvider({
  children,
  accessToken,
  liveEdit = false,
  lang = 'de',
}: {
  children: ReactNode;
  accessToken: string;
  liveEdit?: boolean;
  lang?: string;
}) {
  // Initialize configuration with access token and language
  initializeConfiguration(accessToken, lang);

  // Fetch config server-side
  let config: ConfigResponse | null = null;
  try {
    config = await getOrFetchConfig();
  } catch (error) {
    console.error('Failed to fetch Flyo config:', error);
  }

  // Dynamically import client provider to avoid bundling client code
  const { FlyoClientProvider } = await import('./client.js');

  // Pass the config to the client provider
  return (
    <FlyoClientProvider config={config}>
      {children}
    </FlyoClientProvider>
  );
}


/**
 * FlyoNitroPage component renders all blocks from a Flyo page
 */
export function FlyoNitroPage({
  page,
}: {
  page: Page
}) {
  if (!page?.json || !Array.isArray(page.json)) {
    return null;
  }

  return (
    <>
      {page.json.map((block: any, index: number) => (
        <FlyoNitroBlock
          key={block.uid || index}
          block={block}
        />
      ))}
    </>
  );
}

export function FlyoNitroBlock({
  block,
}: {
  block: Block
}) {
  if (!block) {
    return null;
  }

  return (
    <div>
      {/* Render block content here */}
      <pre>{JSON.stringify(block, null, 2)}</pre>
    </div>
  );
}
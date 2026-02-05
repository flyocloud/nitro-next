import { cache } from 'react';
import type { Metadata, MetadataRoute } from 'next';
import { notFound } from 'next/navigation';
import {
  Page,
  Block,
  Entity,
  ConfigApi,
  ConfigResponse,
  Configuration,
  PagesApi,
  EntitiesApi,
  SitemapApi,
  SearchApi
} from '@flyo/nitro-typescript';

/**
 * Interface for Nitro configuration state
 */
export interface NitroState {
  configuration: Configuration | null;
  accessToken: string | null;
  lang: string | null;
  baseUrl: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  components: Record<string, any>;
  showMissingComponentAlert: boolean;
  liveEdit: boolean;
  serverCacheTtl: number;
  clientCacheTtl: number;
}

/**
 * Global Nitro state - shared across server and middleware
 */
export const globalNitroState: NitroState = {
  configuration: null,
  accessToken: null,
  lang: null,
  baseUrl: null,
  components: {},
  showMissingComponentAlert: false,
  liveEdit: false,
  serverCacheTtl: 1200,
  clientCacheTtl: 900
};

/**
 * Access the Nitro configuration state
 * Can be used anywhere: server components, middlewares, API routes, etc.
 * Must be called after initNitro() has been initialized.
 * 
 * @throws {Error} If Nitro has not been initialized with initNitro()
 * 
 * @example
 * ```ts
 * const state = getNitro();
 * const { configuration, lang, components } = state;
 * ```
 */
export function getNitro(): NitroState {
  if (!globalNitroState.configuration) {
    throw new Error('Nitro has not been initialized. Make sure to call initNitro() first.');
  }
  return globalNitroState;
}

export const initNitro = ({
  accessToken,
  lang,
  baseUrl,
  components,
  showMissingComponentAlert,
  liveEdit,
  serverCacheTtl,
  clientCacheTtl,
}: {
  accessToken: string;
  lang?: string;
  baseUrl?: string;
  components?: object;
  showMissingComponentAlert?: boolean;
  liveEdit?: boolean;
  serverCacheTtl?: number;
  clientCacheTtl?: number;
}): ( () => NitroState )   => {

    if (!globalNitroState.configuration) {
      globalNitroState.configuration = new Configuration({
        apiKey: accessToken,
      });
    }

    globalNitroState.accessToken = accessToken;
    globalNitroState.lang = lang ?? null;
    globalNitroState.baseUrl = baseUrl ?? null;
    globalNitroState.components = components ?? {};
    globalNitroState.showMissingComponentAlert = showMissingComponentAlert ?? liveEdit ?? false;
    globalNitroState.liveEdit = liveEdit ?? false;
    globalNitroState.serverCacheTtl = serverCacheTtl ?? 1200;
    globalNitroState.clientCacheTtl = clientCacheTtl ?? 900;

    return () => globalNitroState;
}

export const getNitroConfig = cache(async (): Promise<ConfigResponse> => {
    const state = getNitro();

    const configApi = new ConfigApi(state.configuration!);
    const useLang = state.lang ?? undefined;

    const config = await configApi.config({ lang: useLang });
    
    return config;
});

export function getNitroPages(): PagesApi {
  return new PagesApi(getNitro().configuration!);
}

export function getNitroEntities(): EntitiesApi {
  return new EntitiesApi(getNitro().configuration!);
}

export function getNitroSitemap(): SitemapApi {
  return new SitemapApi(getNitro().configuration!);
}

export function getNitroSearch(): SearchApi {
  return new SearchApi(getNitro().configuration!);
}

/**
 * Route params type for Next.js catch-all routes
 */
type RouteParams = {
  params: Promise<{ slug?: string[] }>;
};

/**
 * Generic route params type for entity routes
 * Allows any param structure from Next.js app router
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EntityRouteParams<T = any> = {
  params: Promise<T>;
};

/**
 * Internal helper to resolve Nitro page from route params
 * Uses React cache to avoid duplicate fetching
 */
const resolveNitroRoute = cache(async ({ params }: RouteParams) => {
  const { slug } = await params;
  const path = slug?.join('/') ?? '';

  const cfg = await getNitroConfig();

  if (!cfg.pages?.includes(path)) {
    notFound();
  }

  const page = await getNitroPages()
    .page({ slug: path })
    .catch((error: unknown) => {
      console.error('Error fetching page:', path, error);
      notFound();
    });

  if (!page) {
    notFound();
  }

  return { page, path, cfg };
});

/**
 * Entity resolver function type
 * Users provide this to resolve entities from their route params
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EntityResolver<T = any> = (params: Promise<T>) => Promise<Entity>;

/**
 * Helper function to read environment variables with fallback
 * Checks process.env for server-side environment variables
 */
const readEnv = (key: string, fallback = ""): string => {
  const value = process.env[key];
  if (value !== undefined && value !== "") {
    return String(value);
  }
  return fallback;
};

/**
 * NitroDebugInfo Component
 * 
 * Outputs debug information about the current Nitro/Flyo setup as an HTML comment.
 * This includes environment info, API version, token type, deployment details, etc.
 * 
 * Usage: Add <NitroDebugInfo config={config} /> to your layout to include debug info in the HTML output.
 */
export function NitroDebugInfo({ config }: { config: ConfigResponse }) {
  try {
    // Get Nitro state
    const state = getNitro();

    // Get environment variables
    const mode = readEnv("NODE_ENV", "-");
    const vercelDeploymentId = readEnv("VERCEL_DEPLOYMENT_ID", "-");
    const vercelGitCommitSha = readEnv("VERCEL_GIT_COMMIT_SHA", "-");
    const version = readEnv("VERSION", "");

    // Get token from configuration and determine type
    const tokenValue = state.accessToken || "";
    const token = typeof tokenValue === "string" ? tokenValue : "";
    const tokenType = token.startsWith("p-")
      ? "production"
      : token.startsWith("d-")
      ? "develop"
      : "unknown";

    // Get live edit / debug status
    const debug = state.liveEdit;

    // Get API version from config.nitro
    const apiVersion = config.nitro?.version?.toString() || "-";
    const apiLastUpdate = config.nitro?.updated_at
      ? new Date(config.nitro.updated_at * 1000).toLocaleString("de-CH", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "-";

    // Build debug info parts
    const debugInfoParts = [
      `liveedit:${debug}`,
      `env:${mode}`,
      `version:${apiVersion}`,
      `versiondate:${apiLastUpdate}`,
      `tokentype:${tokenType}`,
      `did:${vercelDeploymentId}`,
      `csha:${vercelGitCommitSha}`,
    ];

    if (version) {
      debugInfoParts.push(`release:${version}`);
    }

    const debugInfo = debugInfoParts.join(" | ");

    // Return just the HTML comment as a real HTML comment (not text)
    // React requires dangerouslySetInnerHTML for raw HTML, so we use an empty template element
    // which is semantic and doesn't render in the DOM tree
    return (
      <template dangerouslySetInnerHTML={{ __html: `<!-- ${debugInfo} -->` }} suppressHydrationWarning />
    );
  } catch (error) {
    // If Nitro is not initialized or there's an error, return empty comment
    return <template dangerouslySetInnerHTML={{ __html: `<!-- nitro-debug: not initialized -->` }} suppressHydrationWarning />;
  }
}

/**
 * Internal helper to wrap and cache entity resolvers
 * Ensures the resolver is only called once per unique params
 */
function createCachedEntityResolver<T>(
  resolver: EntityResolver<T>
): (props: EntityRouteParams<T>) => Promise<Entity> {
  return cache(async ({ params }: EntityRouteParams<T>) => {
    const entity = await resolver(params);
    
    if (!entity) {
      notFound();
    }
    
    return entity;
  });
}


/**
 * NitroPage component renders all blocks from a Flyo page
 */
export function NitroPage({
  page,
}: {
  page: Page
}) {
  if (!page?.json || !Array.isArray(page.json)) {
    return null;
  }

  return (
    <>
      {page.json.map((block: Block, index: number) => (
        <NitroBlock
          key={block.uid || index}
          block={block}
        />
      ))}
    </>
  );
}

export function NitroBlock({
  block,
}: {
  block: Block
}) {
  if (!block) {
    return null;
  }

  const state = getNitro();
  const Component = block.component ? state.components[block.component] : undefined;

  if (Component) {
    return <Component block={block} />;
  }

  if (state.showMissingComponentAlert) {
    return (
      <div style={{ border: '1px solid #fff', padding: '1rem', marginBottom: '1rem', backgroundColor: 'red' }}>
        Component <b>{block.component}</b> not found.
      </div>
    );
  }

  return null;
}

/**
 * NitroSlot component renders nested blocks from a slot
 * Used for recursive block rendering when blocks contain slots
 * 
 * @example
 * ```tsx
 * import { NitroSlot } from '@flyo/nitro-next/server';
 * 
 * export default function MyComponent({ block }) {
 *   return (
 *     <div>
 *       <NitroSlot slot={block.slots.mysuperslotname} />
 *     </div>
 *   );
 * }
 * ```
 */
export function NitroSlot({
  slot,
}: {
  slot?: {
    content?: Block[];
  };
}) {
  if (!slot?.content || !Array.isArray(slot.content)) {
    return null;
  }

  return (
    <>
      {slot.content.map((block: Block, index: number) => (
        <NitroBlock
          key={block.uid || index}
          block={block}
        />
      ))}
    </>
  );
}

/**
 * Default page route handler for Nitro pages
 * Can be re-exported directly from Next.js app routes
 * 
 * @example
 * ```ts
 * // app/[[...slug]]/page.tsx
 * export { nitroPageRoute as default } from '@flyo/nitro-next/server';
 * ```
 */
export async function nitroPageRoute(props: RouteParams) {
  const { page } = await resolveNitroRoute(props);
  return <NitroPage page={page} />;
}

/**
 * Generate metadata for Nitro pages
 * Provides basic meta tags based on Flyo page data
 * Can be re-exported directly from Next.js app routes
 * 
 * @example
 * ```ts
 * // app/[[...slug]]/page.tsx
 * export { nitroPageGenerateMetadata as generateMetadata } from '@flyo/nitro-next/server';
 * ```
 */
export async function nitroPageGenerateMetadata(
  props: RouteParams
): Promise<Metadata> {
  const { page } = await resolveNitroRoute(props);

  // Extract meta information from page
  const meta = page.meta_json;
  
  const title = meta?.title ?? page.title ?? 'Page';
  const description = meta?.description ?? '';
  const image = meta?.image ?? '';

  const ogImage = image ? `${image}/thumb/1200x630?format=jpg` : undefined;
  const twImage = image ? `${image}/thumb/1200x600?format=jpg` : undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: ogImage ? [ogImage] : [],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: twImage ? [twImage] : [],
    },
  };
}

/**
 * Generate static params for all Nitro pages
 * Enables static site generation (SSG) for all pages
 * Can be re-exported directly from Next.js app routes
 * 
 * @example
 * ```ts
 * // app/[[...slug]]/page.tsx
 * export { nitroPageGenerateStaticParams as generateStaticParams } from '@flyo/nitro-next/server';
 * ```
 */
export async function nitroPageGenerateStaticParams() {
  const cfg = await getNitroConfig();
  const pages = cfg.pages ?? [];

  return pages.map((path: string) => ({
    slug: path === '' ? undefined : path.split('/'),
  }));
}

/**
 * Default entity route handler with custom resolver
 * Flexible solution that works with any route param structure
 * 
 * @example
 * ```ts
 * // app/blog/[slug]/page.tsx
 * const resolver = async (params: Promise<{ slug: string }>) => {
 *   const { slug } = await params;
 *   return getNitroEntities().entityBySlug({ slug, typeId: 123 });
 * };
 * 
 * export default (props) => nitroEntityRoute(props, {
 *   resolver,
 *   render: (entity) => <h1>{entity.entity?.entity_title}</h1>
 * });
 * ```
 * 
 * @example
 * ```ts
 * // app/items/[uniqueid]/page.tsx
 * const resolver = async (params: Promise<{ uniqueid: string }>) => {
 *   const { uniqueid } = await params;
 *   return getNitroEntities().entityByUniqueid({ uniqueid });
 * };
 * 
 * export default (props) => nitroEntityRoute(props, { resolver });
 * ```
 * 
 * @example
 * ```ts
 * // app/custom/[whatever]/page.tsx
 * const resolver = async (params: Promise<{ whatever: string }>) => {
 *   const { whatever } = await params;
 *   return getNitroEntities().entityBySlug({ slug: whatever });
 * };
 * 
 * export default (props) => nitroEntityRoute(props, { resolver });
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function nitroEntityRoute<T = any>(
  props: EntityRouteParams<T>,
  options: {
    resolver: EntityResolver<T>;
    render?: (entity: Entity) => React.ReactNode;
  }
) {
  const cachedResolver = createCachedEntityResolver(options.resolver);
  
  return (async () => {
    const entity = await cachedResolver(props);
    
    if (options.render) {
      return options.render(entity);
    }

    // Default simple render - users should provide their own render function
    return <div>{entity.entity?.entity_title}</div>;
  })();
}

/**
 * Generate metadata for Nitro entities with custom resolver
 * Works with any route param structure
 * 
 * @example
 * ```ts
 * // app/blog/[slug]/page.tsx
 * const resolver = async (params: Promise<{ slug: string }>) => {
 *   const { slug } = await params;
 *   return getNitroEntities().entityBySlug({ slug, typeId: 123 });
 * };
 * 
 * export const generateMetadata = (props) => nitroEntityGenerateMetadata(props, { resolver });
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function nitroEntityGenerateMetadata<T = any>(
  props: EntityRouteParams<T>,
  options: {
    resolver: EntityResolver<T>;
  }
): Promise<Metadata> {
  const cachedResolver = createCachedEntityResolver(options.resolver);
  const entity = await cachedResolver(props);

  const title = entity.entity?.entity_title ?? 'Entity';
  const description = entity.entity?.entity_teaser ?? '';
  const image = entity.entity?.entity_image ?? '';

  const ogImage = image ? `${image}/thumb/1200x630?format=jpg` : undefined;
  const twImage = image ? `${image}/thumb/1200x600?format=jpg` : undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: ogImage ? [ogImage] : [],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: twImage ? [twImage] : [],
    },
  };
}

/**
 * Generate sitemap for Next.js from Flyo Nitro
 * Fetches all pages and entities from the sitemap endpoint
 * Uses the baseUrl from the Nitro configuration state
 * 
 * @param state The Nitro state containing configuration and baseUrl
 * @returns Promise resolving to Next.js MetadataRoute.Sitemap format
 * 
 * @example
 * ```ts
 * // app/sitemap.ts
 * import { nitroSitemap } from '@flyo/nitro-next/server';
 * import { flyoConfig } from '../flyo.config';
 * 
 * export default async function sitemap() {
 *   return nitroSitemap(flyoConfig());
 * }
 * ```
 * 
 * @example
 * ```ts
 * // flyo.config.tsx
 * export const flyoConfig = initNitro({
 *   accessToken: process.env.FLYO_ACCESS_TOKEN!,
 *   baseUrl: process.env.SITE_URL || 'http://localhost:3000',
 *   lang: 'en',
 * });
 * ```
 */
export async function nitroSitemap(state: NitroState): Promise<MetadataRoute.Sitemap> {
  const sitemapApi = getNitroSitemap();
  const lang = state.lang ?? undefined;

  if (!state.baseUrl) {
    throw new Error('baseUrl is not configured in Nitro state. Please set it in initNitro().');
  }

  // Fetch all sitemap entries from Flyo Nitro
  const items = await sitemapApi.sitemap({ lang });

  const baseUrl = state.baseUrl;
  
  // Remove trailing slash from baseUrl for consistency
  const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

  return items.map((item) => {
    // Prefer routes object if available, otherwise use entity_slug
    let path = '';
    
    if (item.routes && typeof item.routes === 'object') {
      // Use the first available route from the routes object
      const routeValues = Object.values(item.routes);
      if (routeValues.length > 0) {
        path = routeValues[0];
      }
    }
    
    // Fallback to entity_slug if no routes found
    if (!path && item.entity_slug) {
      path = item.entity_slug;
    }

    // Ensure path starts with /
    const cleanPath = path && !path.startsWith('/') ? `/${path}` : path;

    // Convert Unix timestamp to Date if available
    const lastModified = new Date();

    return {
      url: `${cleanBaseUrl}${cleanPath}`,
      lastModified,
    };
  });
}
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
 * Read-only configuration state
 */
export interface NitroState {
  readonly accessToken: string;
  readonly lang: string | null;
  readonly baseUrl: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly components: Record<string, any>;
  readonly showMissingComponentAlert: boolean;
  readonly liveEdit: boolean;
  readonly serverCacheTtl: number;
  readonly clientCacheTtl: number;
}

/**
 * Route params type for Next.js catch-all routes
 */
type RouteParams = {
  params: Promise<{ slug?: string[] }>;
};

/**
 * Generic route params type for entity routes
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EntityRouteParams<T = any> = {
  params: Promise<T>;
};

/**
 * Entity resolver function type
 * Users provide this to resolve entities from their route params
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EntityResolver<T = any> = (params: Promise<T>) => Promise<Entity>;

/**
 * The Flyo instance returned by initNitro().
 * Carries all API access methods and configuration state.
 */
export interface FlyoInstance {
  /** Read-only configuration state */
  readonly state: NitroState;
  /** Fetch and cache the Nitro CMS configuration (React-cached per request) */
  getNitroConfig(): Promise<ConfigResponse>;
  /** Create a PagesApi client */
  getNitroPages(): PagesApi;
  /** Create an EntitiesApi client */
  getNitroEntities(): EntitiesApi;
  /** Create a SitemapApi client */
  getNitroSitemap(): SitemapApi;
  /** Create a SearchApi client */
  getNitroSearch(): SearchApi;
  /** Resolve a page from catch-all route params (React-cached per request) */
  pageResolveRoute(props: RouteParams): Promise<{ page: Page; path: string; cfg: ConfigResponse }>;
  /** Generate a Next.js sitemap from Flyo Nitro content */
  sitemap(): Promise<MetadataRoute.Sitemap>;
}

/**
 * Initialize and return a FlyoInstance.
 *
 * Call once in your flyo.config.tsx and export the result.
 * The returned object carries all methods bound to the configuration,
 * eliminating the need for global state.
 *
 * @example
 * ```tsx
 * // flyo.config.tsx
 * import { initNitro } from '@flyo/nitro-next/server';
 *
 * export const flyo = initNitro({
 *   accessToken: process.env.FLYO_ACCESS_TOKEN || '',
 *   lang: 'en',
 *   baseUrl: process.env.SITE_URL || 'http://localhost:3000',
 *   liveEdit: process.env.FLYO_LIVE_EDIT === 'true',
 *   components: { HeroBanner, Text },
 * });
 * ```
 */
export function initNitro({
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  components?: Record<string, any>;
  showMissingComponentAlert?: boolean;
  liveEdit?: boolean;
  serverCacheTtl?: number;
  clientCacheTtl?: number;
}): FlyoInstance {
  const configuration = new Configuration({ apiKey: accessToken });

  const state: NitroState = {
    accessToken,
    lang: lang ?? null,
    baseUrl: baseUrl ?? null,
    components: components ?? {},
    showMissingComponentAlert: showMissingComponentAlert ?? liveEdit ?? false,
    liveEdit: liveEdit ?? false,
    serverCacheTtl: serverCacheTtl ?? 1200,
    clientCacheTtl: clientCacheTtl ?? 900,
  };

  const getNitroConfig = cache(async (): Promise<ConfigResponse> => {
    const configApi = new ConfigApi(configuration);
    const useLang = state.lang ?? undefined;
    return configApi.config({ lang: useLang });
  });

  const pageResolveRoute = cache(async ({ params }: RouteParams) => {
    const { slug } = await params;
    const path = slug?.join('/') ?? '';

    const cfg = await getNitroConfig();

    if (!cfg.pages?.includes(path)) {
      notFound();
    }

    const page = await new PagesApi(configuration)
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

  const sitemap = async (): Promise<MetadataRoute.Sitemap> => {
    const sitemapApi = new SitemapApi(configuration);
    const sitemapLang = state.lang ?? undefined;

    if (!state.baseUrl) {
      throw new Error('baseUrl is not configured. Please set it in initNitro().');
    }

    const items = await sitemapApi.sitemap({ lang: sitemapLang });
    const cleanBaseUrl = state.baseUrl.endsWith('/') ? state.baseUrl.slice(0, -1) : state.baseUrl;

    return items.map((item) => {
      let path = '';

      if (item.routes && typeof item.routes === 'object') {
        const routeValues = Object.values(item.routes);
        if (routeValues.length > 0) {
          path = routeValues[0];
        }
      }

      if (!path && item.entity_slug) {
        path = item.entity_slug;
      }

      const cleanPath = path && !path.startsWith('/') ? `/${path}` : path;

      return {
        url: `${cleanBaseUrl}${cleanPath}`,
        lastModified: new Date(),
      };
    });
  };

  return {
    state,
    getNitroConfig,
    getNitroPages: () => new PagesApi(configuration),
    getNitroEntities: () => new EntitiesApi(configuration),
    getNitroSitemap: () => new SitemapApi(configuration),
    getNitroSearch: () => new SearchApi(configuration),
    pageResolveRoute,
    sitemap,
  };
}

// ─── Helper ──────────────────────────────────────────────────────────────────

/**
 * Helper function to read environment variables with fallback
 */
const readEnv = (key: string, fallback = ""): string => {
  const value = process.env[key];
  if (value !== undefined && value !== "") {
    return String(value);
  }
  return fallback;
};

/**
 * Internal helper to wrap and cache entity resolvers
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

// ─── Server Components ───────────────────────────────────────────────────────

/**
 * NitroDebugInfo Component
 *
 * Async server component that outputs debug information as an HTML comment.
 * Resolves config internally from the flyo instance.
 *
 * @example
 * ```tsx
 * <NitroDebugInfo flyo={flyo} />
 * ```
 */
export async function NitroDebugInfo({ flyo }: { flyo: FlyoInstance }) {
  try {
    const config = await flyo.getNitroConfig();
    const { state } = flyo;

    const mode = readEnv("NODE_ENV", "-");
    const vercelDeploymentId = readEnv("VERCEL_DEPLOYMENT_ID", "-");
    const vercelGitCommitSha = readEnv("VERCEL_GIT_COMMIT_SHA", "-");
    const version = readEnv("VERSION", "");

    const tokenValue = state.accessToken || "";
    const token = typeof tokenValue === "string" ? tokenValue : "";
    const tokenType = token.startsWith("p-")
      ? "production"
      : token.startsWith("d-")
      ? "develop"
      : "unknown";

    const debug = state.liveEdit;

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

    return (
      <template dangerouslySetInnerHTML={{ __html: `<!-- ${debugInfo} -->` }} suppressHydrationWarning />
    );
  } catch {
    return <template dangerouslySetInnerHTML={{ __html: `<!-- nitro-debug: not initialized -->` }} suppressHydrationWarning />;
  }
}

/**
 * Renders a JSON-LD structured data script tag from an Entity's jsonld field.
 * Safely escapes HTML to prevent XSS.
 */
export function NitroEntityJsonLd({ entity }: { entity: Entity }) {
  if (!entity?.jsonld) {
    return null;
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(entity.jsonld).replace(/</g, '\\u003c'),
      }}
    />
  );
}

/**
 * NitroPage renders all blocks from a Flyo page.
 */
export function NitroPage({
  page,
  flyo,
}: {
  page: Page;
  flyo: FlyoInstance;
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
          flyo={flyo}
        />
      ))}
    </>
  );
}

/**
 * NitroBlock renders a single block using the registered component.
 */
export function NitroBlock({
  block,
  flyo,
}: {
  block: Block;
  flyo: FlyoInstance;
}) {
  if (!block) {
    return null;
  }

  const Component = block.component ? flyo.state.components[block.component] : undefined;

  if (Component) {
    return <Component block={block} />;
  }

  if (flyo.state.showMissingComponentAlert) {
    return (
      <div style={{ border: '1px solid #fff', padding: '1rem', marginBottom: '1rem', backgroundColor: 'red' }}>
        Component <b>{block.component}</b> not found.
      </div>
    );
  }

  return null;
}

/**
 * NitroSlot renders nested blocks from a slot.
 * Used for recursive block rendering when blocks contain slots.
 *
 * @example
 * ```tsx
 * import { flyo } from '@/flyo.config';
 * import { NitroSlot } from '@flyo/nitro-next/server';
 *
 * export function MyComponent({ block }) {
 *   return (
 *     <div>
 *       <NitroSlot slot={block.slots?.content} flyo={flyo} />
 *     </div>
 *   );
 * }
 * ```
 */
export function NitroSlot({
  slot,
  flyo,
}: {
  slot?: {
    content?: Block[];
  };
  flyo: FlyoInstance;
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
          flyo={flyo}
        />
      ))}
    </>
  );
}

// ─── Factory Functions ───────────────────────────────────────────────────────

/**
 * Create a page route handler for Nitro pages.
 * Returns a Next.js page component function.
 *
 * @example
 * ```tsx
 * import { flyo } from '@/flyo.config';
 * import { nitroPageRoute } from '@flyo/nitro-next/server';
 *
 * export default nitroPageRoute(flyo);
 * ```
 */
export function nitroPageRoute(flyo: FlyoInstance) {
  async function pageRoute(props: RouteParams) {
    const { page } = await flyo.pageResolveRoute(props);
    return <NitroPage page={page} flyo={flyo} />;
  }
  return pageRoute;
}

/**
 * Create a metadata generator for Nitro pages.
 * Returns a Next.js generateMetadata function.
 *
 * @example
 * ```tsx
 * import { flyo } from '@/flyo.config';
 * import { nitroPageGenerateMetadata } from '@flyo/nitro-next/server';
 *
 * export const generateMetadata = nitroPageGenerateMetadata(flyo);
 * ```
 */
export function nitroPageGenerateMetadata(flyo: FlyoInstance) {
  return async (props: RouteParams): Promise<Metadata> => {
    const { page } = await flyo.pageResolveRoute(props);

    const meta = page.meta_json;
    const title = meta?.title || page.title || '';
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
  };
}

/**
 * Create a static params generator for Nitro pages.
 * Returns a Next.js generateStaticParams function.
 *
 * @example
 * ```tsx
 * import { flyo } from '@/flyo.config';
 * import { nitroPageGenerateStaticParams } from '@flyo/nitro-next/server';
 *
 * export const generateStaticParams = nitroPageGenerateStaticParams(flyo);
 * ```
 */
export function nitroPageGenerateStaticParams(flyo: FlyoInstance) {
  return async () => {
    const cfg = await flyo.getNitroConfig();
    const pages = cfg.pages ?? [];

    return pages.map((path: string) => ({
      slug: path === '' ? undefined : path.split('/'),
    }));
  };
}

/**
 * Create an entity route handler with a custom resolver.
 * Returns a Next.js page component function.
 *
 * @example
 * ```tsx
 * import { flyo } from '@/flyo.config';
 * import { nitroEntityRoute } from '@flyo/nitro-next/server';
 *
 * const resolver = async (params) => {
 *   const { slug } = await params;
 *   return flyo.getNitroEntities().entityBySlug({ slug, typeId: 123 });
 * };
 *
 * export default nitroEntityRoute(flyo, {
 *   resolver,
 *   render: (entity) => <h1>{entity.entity?.entity_title}</h1>,
 * });
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function nitroEntityRoute<T = any>(
  flyo: FlyoInstance,
  options: {
    resolver: EntityResolver<T>;
    render?: (entity: Entity) => React.ReactNode;
  }
) {
  const cachedResolver = createCachedEntityResolver(options.resolver);

  async function entityRoute(props: EntityRouteParams<T>) {
    const entity = await cachedResolver(props);

    if (options.render) {
      return options.render(entity);
    }

    return <div>{entity.entity?.entity_title}</div>;
  }
  return entityRoute;
}

/**
 * Create a metadata generator for entity detail pages.
 * Returns a Next.js generateMetadata function.
 *
 * @example
 * ```tsx
 * import { flyo } from '@/flyo.config';
 * import { nitroEntityGenerateMetadata } from '@flyo/nitro-next/server';
 *
 * export const generateMetadata = nitroEntityGenerateMetadata(flyo, { resolver });
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function nitroEntityGenerateMetadata<T = any>(
  flyo: FlyoInstance,
  options: {
    resolver: EntityResolver<T>;
  }
) {
  const cachedResolver = createCachedEntityResolver(options.resolver);

  return async (props: EntityRouteParams<T>): Promise<Metadata> => {
    const entity = await cachedResolver(props);

    const title = entity.entity?.entity_title || '';
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
  };
}
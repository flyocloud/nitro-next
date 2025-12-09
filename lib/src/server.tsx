import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  Page,
  Block,
  Entity,
  ConfigApi,
  ConfigResponse,
  Configuration,
  PagesApi,
  EntitiesApi
} from '@flyo/nitro-typescript';

let globalConfiguration: Configuration | null = null;
let globalLang: string | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let globalComponents: Record<string, any> = {};
let globalShowMissingComponentAlert: boolean = false;

export const initNitro = ({accessToken, lang, components, showMissingComponentAlert}: {accessToken: string, lang?: string, components?: object, showMissingComponentAlert?: boolean}): ( () => Configuration )   => {

    if (!globalConfiguration) {
      globalConfiguration = new Configuration({
        apiKey: accessToken,
      });
    }

    globalLang = lang ?? null;
    globalComponents = components ?? {};
    globalShowMissingComponentAlert = showMissingComponentAlert ?? false;

    return () => globalConfiguration!;
}

export const getNitroConfig = cache(async (): Promise<ConfigResponse> => {

    const configApi = new ConfigApi(globalConfiguration!);
    const useLang = globalLang ?? undefined;

    const config = await configApi.config({ lang: useLang });
    
    return config;
});

export function getNitroPages(): PagesApi {
  return new PagesApi(globalConfiguration!);
}

export function getNitroEntities(): EntitiesApi {
  return new EntitiesApi(globalConfiguration!);
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

  const Component = block.component ? globalComponents[block.component] : undefined;

  if (Component) {
    return <Component block={block} />;
  }

  if (globalShowMissingComponentAlert) {
    return (
      <div style={{ border: '1px solid #fff', padding: '1rem', marginBottom: '1rem', backgroundColor: 'red' }}>
        Component <b>{block.component}</b> not found.
      </div>
    );
  }

  return null;
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
 * export { nitroGenerateMetadata as generateMetadata } from '@flyo/nitro-next/server';
 * ```
 */
export async function nitroGenerateMetadata(
  props: RouteParams
): Promise<Metadata> {
  const { page } = await resolveNitroRoute(props);

  // Extract meta information from page
  const meta = page.meta_json;
  
  const title = meta?.title ?? page.title ?? 'Page';
  const description = meta?.description ?? '';
  const image = meta?.image ?? '';

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: image ? [image] : [],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: image ? [image] : [],
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
 * export { nitroGenerateStaticParams as generateStaticParams } from '@flyo/nitro-next/server';
 * ```
 */
export async function nitroGenerateStaticParams() {
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

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: image ? [image] : [],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: image ? [image] : [],
    },
  };
}
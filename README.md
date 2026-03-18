# Flyo Nitro for Next.Js

<p align="center">
  <img src="https://storage.flyo.cloud/12_K6uT5tY4TwXRL3_flyo-logo-colored.png" alt="Flyo" width="140" />
  &nbsp;&nbsp;&nbsp;&nbsp;
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/nextjs/nextjs-original.svg" alt="Next.js" width="160" />
</p>

> **⚠️ Important:** This library is designed exclusively for Next.js **App Router**. It requires server-side setup and is not compatible with the Pages Router. Make sure your Next.js project is using the App Router architecture.

## Usage

### 1. Installation

```bash
npm install @flyo/nitro-next
```

### 2. Configuration

Create a `flyo.config.tsx` file to configure the library and your components.

```tsx
import type { ReactNode } from 'react';
import { initNitro } from '@flyo/nitro-next/server';
import { FlyoClientWrapper } from '@flyo/nitro-next/client';
import { HeroBanner } from './components/HeroBanner';
import { Text } from './components/Text';

// Get configuration from environment variables
const accessToken = process.env.FLYO_ACCESS_TOKEN || '';
const liveEdit = process.env.FLYO_LIVE_EDIT === 'true';
const baseUrl = process.env.SITE_URL || 'http://localhost:3000';

export const flyoConfig = initNitro({
  // API token for authenticating with the Flyo CMS
  accessToken: accessToken,
  // Language code for content retrieval
  lang: 'en',
  // Base URL for your site (used for sitemap generation, canonical URLs, etc.)
  baseUrl: baseUrl,
  // Enable live editing mode - when true, wraps your app with FlyoClientWrapper for real-time content updates
  liveEdit: liveEdit,
  // Server/CDN cache TTL in seconds (default: 1200 = 20 minutes)
  serverCacheTtl: 1200,
  // Client browser cache TTL in seconds (default: 900 = 15 minutes)
  clientCacheTtl: 900,
  // Map of CMS block types to React components - register all custom components here
  components: {
    HeroBanner: HeroBanner,
    Text: Text
  }
});

/**
 * Pre-configured Flyo component
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
```

### 3. Setup Proxy

Create a `proxy.ts` file in the `src/` directory to handle cache control:

```tsx
import { createProxy } from '@flyo/nitro-next/proxy';
import { flyoConfig } from './flyo.config';

export default createProxy(flyoConfig());

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

The proxy middleware:
- Sets appropriate cache headers for CDN (s-maxage) and browser (max-age) based on your configuration
- Disables caching when live edit mode is enabled (development mode)
- Uses Next.js middleware to intercept all requests matching the configured pattern
- Reads cache TTL values from your Nitro configuration (`serverCacheTtl` and `clientCacheTtl`)

**Configuration options in `initNitro()`:**
- `liveEdit` - Enables live edit mode (typically controlled via environment variable), disables caching (default: false)
- `serverCacheTtl` - CDN cache duration in seconds (default: 1200 = 20 min)
- `clientCacheTtl` - Browser cache duration in seconds (default: 900 = 15 min)

### 4. Setup Layout

Wrap your application with the provider in `app/layout.tsx`.

```tsx
import Link from 'next/link';
import { Flyo } from '@/flyo.config';
import { getNitroConfig, NitroDebugInfo } from '@flyo/nitro-next/server';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const config = await getNitroConfig();
  const navItems = config?.containers?.nav?.items ?? [];
  
  return (
    <Flyo>
      <html>
        <body>
          <header>
            <nav>
              <ul className="flex gap-6">
                {navItems.map((item, index) => (
                  <li key={index}>
                    <Link
                      href={item.href}
                      target={item.target}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </header>

          <NitroDebugInfo config={config} />
          {children}
        </body>
      </html>
    </Flyo>
  );
}
```

In this example, the navigation is read from `config.containers.nav` and rendered in the layout header.
Make sure your Flyo container key is `nav` (or adjust the key accordingly).

The `NitroDebugInfo` component outputs debug information as an HTML comment, including:
- Live edit status
- Environment mode
- API version and last update date
- Token type (production/develop)
- Deployment ID and commit SHA (Vercel)
- Release version (if set)

This is useful for debugging and verifying your deployment configuration.

### 5. Create Page

Create a catch-all route in `app/[[...slug]]/page.tsx` to handle dynamic pages.

```tsx
// Re-export the Nitro route handlers for a one-liner setup
export {
  nitroPageRoute as default,
  nitroPageGenerateMetadata as generateMetadata,
  // NOTE: generateStaticParams is commented out by default!
  // 
  // ⚠️ IMPORTANT: Only enable this in PRODUCTION builds!
  // 
  // When enabled, Next.js will pre-render ALL pages at build time, which:
  // - Disables dynamic caching completely
  // - Prevents live preview updates in the Nitro CMS editor
  // - Makes the preview frame unusable (you won't see changes anymore)
  // 
  // To enable in production only, use a conditional export:
  // ...(process.env.FLYO_LIVE_EDIT !== 'true' && {
  //   generateStaticParams: nitroPageGenerateStaticParams
  // })
  //
  // nitroPageGenerateStaticParams as generateStaticParams,
} from "@flyo/nitro-next/server";
```

#### Custom Page Rendering

If you need to access the page data for custom logic (e.g. reading page properties, adding conditional wrappers, passing data to other components), use `nitroPageResolveRoute` instead of the one-liner re-export:

```tsx
// app/[[...slug]]/page.tsx
import { nitroPageResolveRoute, NitroPage, nitroPageGenerateMetadata } from '@flyo/nitro-next/server';

// Metadata still works with the standard helper
export const generateMetadata = nitroPageGenerateMetadata;

export default async function Page(props: { params: Promise<{ slug?: string[] }> }) {
  const { page, path, cfg } = await nitroPageResolveRoute(props);

  // Access page data before rendering
  // page - the full Page object (page.title, page.meta_json, page.json, etc.)
  // path - the resolved URL path string
  // cfg  - the Flyo ConfigResponse

  return (
    <div>
      <h1>{page.title}</h1>
      {/* Render all blocks from the page */}
      <NitroPage page={page} />
    </div>
  );
}
```

The `nitroPageResolveRoute` function is React-cached — calling it in both `generateMetadata` and your page component will only trigger a single API request.

#### Caveat: Parallel Routes Must Initialize Config Per Route

If you use parallel routes (for example `@title`) and call Nitro helpers like `nitroPageResolveRoute`, import your `flyo.config` in **every** route file.

Next.js does not guarantee module execution order between parallel routes. Without importing the config in each route module, one route can resolve before Nitro is initialized and the configuration token can be empty.

Example `page.tsx` (trimmed):

```tsx
import '../../../flyo.config';
import {
  NitroPage,
  nitroPageGenerateMetadata,
  nitroPageResolveRoute,
} from '@flyo/nitro-next/server';

export const generateMetadata = nitroPageGenerateMetadata;

export default async function Page(props: { params: Promise<{ slug?: string[] }> }) {
  const { page } = await nitroPageResolveRoute(props);
  return <NitroPage page={page} />;
}
```

Example parallel route `@title` (trimmed):

```tsx
import '../../../flyo.config';
import { nitroPageResolveRoute } from '@flyo/nitro-next/server';

export default async function TitlePage(props: { params: Promise<{ slug?: string[] }> }) {
  const { page } = await nitroPageResolveRoute(props);
  return <>{page.title}</>;
}
```

If you enable `generateStaticParams`, only do this for production builds. Enabling it in preview/live edit setups will pre-render all pages and disable live preview behavior.

### 6. Create Custom Components

Create custom components for your Flyo blocks. Each component receives a `block` object containing the content from your CMS.

```tsx
'use client';

import { Block } from "@flyo/nitro-typescript";
import { editable } from "@flyo/nitro-next/client";

export function HeroBanner({ block }: { block: Block }) {
  return (
    <section {...editable(block)} className="bg-gray-200 p-8 rounded-lg text-center">
      <h2 className="text-3xl font-bold mb-4">
        {block?.content?.title}
      </h2>
      <p className="text-lg mb-6">
        {block?.content?.teaser}
      </p>
      <img 
        src={block?.content?.image?.source} 
        alt={block?.content?.image?.caption} 
        className="mx-auto mb-6" 
      />
    </section>
  );
}
```

The `editable()` helper function marks the component as editable in the Flyo CMS live editor. It spreads the necessary data attributes onto your component's root element to enable in-place editing.

> **Important:** `editable()` is a **client-only** function. Any component that uses `editable()` **must** have `'use client'` as the very first line of the file. Using it in a server component will cause a runtime error.

### 7. WYSIWYG Component

The `FlyoWysiwyg` component renders ProseMirror/TipTap JSON content. It handles standard nodes automatically and allows you to provide custom components for specific node types.

```tsx
'use client';

import { FlyoWysiwyg } from '@flyo/nitro-next/client';

export default function MyComponent({ block }) {
  return (
    <FlyoWysiwyg json={block.content.json} />
  );
}
```

Create a custom component for specific node types:

```tsx
// components/wysiwyg/CustomImage.tsx
'use client';

interface ImageNode {
  node: {
    attrs: {
      src: string;
      alt?: string;
      title?: string;
    };
  };
}

export default function CustomImage({ node }: ImageNode) {
  const { src, alt, title } = node.attrs;
  
  return (
    <img 
      src={src} 
      alt={alt} 
      title={title} 
      style={{ maxWidth: '100%', height: 'auto' }} 
    />
  );
}
```

**Recommended pattern:** create a project-level `AppWysiwyg` wrapper once.
Register your custom node components there and keep a default class (for example `className="wysiwyg"`) so you can reuse the same setup everywhere.

```tsx
// components/wysiwyg/AppWysiwyg.tsx
'use client';

import { FlyoWysiwyg, type WysiwygJson } from '@flyo/nitro-next/client';
import CustomImage from './CustomImage';

export function AppWysiwyg({
  json,
}: {
  json: WysiwygJson;
}) {
  return (
    <FlyoWysiwyg
      json={json}
      className="wysiwyg"
      components={{
        image: CustomImage,
      }}
    />
  );
}
```

Use your wrapper directly in pages/components:

```tsx
'use client';

import { AppWysiwyg } from './components/wysiwyg/AppWysiwyg';

export default function MyComponent({ block }) {
  return <AppWysiwyg json={block.content.json} />;
}
```

This keeps custom WYSIWYG node registration centralized and consistent across your app.
You can still override styles per usage, for example:
`<AppWysiwyg json={block.content.json} className="wysiwyg article-body" />`.

### 8. Image Optimization with Flyo CDN

The `FlyoCdnLoader` function provides automatic image optimization through Flyo's CDN. Use it with Next.js Image component for optimized image delivery with automatic format conversion and resizing.

```tsx
'use client';

import Image from 'next/image';
import { FlyoCdnLoader } from '@flyo/nitro-next/client';

export default function MyComponent({ block }) {
  return (
    <Image
      loader={FlyoCdnLoader}
      src={block.content.image.source}
      alt={block.content.image.caption}
      width={800}
      height={600}
    />
  );
}
```

The loader automatically:
- Adds the Flyo CDN host (`storage.flyo.cloud`) if not already present
- Applies width-based transformations
- Converts images to WebP format for optimal performance

### 9. Nested Blocks (Slots)

When blocks contain nested blocks in slots, use the `NitroSlot` component to recursively render them. This is useful for container-like components that can hold other blocks.

```tsx
import { NitroSlot } from '@flyo/nitro-next/server';
import { Block } from '@flyo/nitro-typescript';

export function Container({ block }: { block: Block }) {
  return (
    <div className="container">
      <h2>{block.content?.title}</h2>
      {/* Render nested blocks from the slot */}
      <NitroSlot slot={block.slots?.content} />
    </div>
  );
}
```

> Keep in mind that `NitroSlot` can only be used in server components, as it relies on server-side rendering of blocks.

The `NitroSlot` component automatically handles:
- Iterating over nested blocks
- Recursively rendering each block using `NitroBlock`
- Supporting unlimited nesting depth

### 10. Entity Detail Pages

Nitro provides flexible helpers for creating entity detail pages with any route structure. You define a **resolver function** that fetches the entity from your route params, and the library handles caching and rendering.

#### Example 1: Entity by Slug

Create `app/blog/[slug]/page.tsx`:

```tsx
import { 
  nitroEntityRoute, 
  nitroEntityGenerateMetadata, 
  getNitroEntities,
  NitroEntityJsonLd,
  type EntityResolver
} from "@flyo/nitro-next/server";
import { FlyoMetric } from "@flyo/nitro-next/client";
import type { Entity } from "@flyo/nitro-typescript";

type RouteParams = {
  params: Promise<{ slug: string }>;
};

// Define how to resolve the entity from route params
const resolver: EntityResolver<{ slug: string }> = async (params) => {
  const { slug } = await params;
  return getNitroEntities().entityBySlug({ 
    slug, 
    typeId: 123 // Your entity type ID from Flyo
  });
};

// Generate metadata for SEO
export const generateMetadata = (props: RouteParams) => 
  nitroEntityGenerateMetadata(props, { resolver });

// Render the page
export default function BlogPost(props: RouteParams) {
  return nitroEntityRoute(props, {
    resolver,
    render: (entity: Entity) => (
      <>
        <NitroEntityJsonLd entity={entity} />
        <FlyoMetric entity={entity} />
        <article>
          <h1>{entity.entity?.entity_title}</h1>
          <p>{entity.entity?.entity_teaser}</p>
          {/* Access all entity data here */}
        </article>
      </>
    )
  });
}
```

#### Example 2: Entity by Unique ID

Create `app/items/[uniqueid]/page.tsx`:

```tsx
import { 
  nitroEntityRoute, 
  nitroEntityGenerateMetadata, 
  getNitroEntities,
  NitroEntityJsonLd,
  type Entity,
  type EntityResolver
} from "@flyo/nitro-next/server";
import { FlyoMetric } from "@flyo/nitro-next/client";

type RouteParams = {
  params: Promise<{ uniqueid: string }>;
};

const resolver: EntityResolver<{ uniqueid: string }> = async (params) => {
  const { uniqueid } = await params;
  return getNitroEntities().entityByUniqueid({ uniqueid });
};

export const generateMetadata = (props: RouteParams) => 
  nitroEntityGenerateMetadata(props, { resolver });

export default function Item(props: RouteParams) {
  return nitroEntityRoute(props, {
    resolver,
    render: (entity: Entity) => (
      <>
        <NitroEntityJsonLd entity={entity} />
        <FlyoMetric entity={entity} />
        <div>
          <h1>{entity.entity?.entity_title}</h1>
        </div>
      </>
    )
  });
}
```

#### Example 3: Custom Route Parameter Name

Works with any route parameter name - create `app/products/[id]/page.tsx`:

```tsx
import { 
  nitroEntityRoute, 
  nitroEntityGenerateMetadata, 
  getNitroEntities,
  NitroEntityJsonLd,
  type Entity,
  type EntityResolver
} from "@flyo/nitro-next/server";
import { FlyoMetric } from "@flyo/nitro-next/client";

type RouteParams = {
  params: Promise<{ id: string }>;
};

const resolver: EntityResolver<{ id: string }> = async (params) => {
  const { id } = await params;
  // Use the id parameter however you need
  return getNitroEntities().entityBySlug({ 
    slug: id,
    typeId: 456
  });
};

export const generateMetadata = (props: RouteParams) => 
  nitroEntityGenerateMetadata(props, { resolver });

export default function Product(props: RouteParams) {
  return nitroEntityRoute(props, {
    resolver,
    render: (entity: Entity) => (
      <>
        <NitroEntityJsonLd entity={entity} />
        <FlyoMetric entity={entity} />
        <div>
          <h1>{entity.entity?.entity_title}</h1>
          <p>{entity.entity?.entity_teaser}</p>
        </div>
      </>
    )
  });
}
```

#### How it Works

1. **Type-safe params**: Define your route params type to match your Next.js route structure
2. **Custom resolver**: Write a function that takes the params and returns an entity
3. **Automatic caching**: The resolver is automatically wrapped with React cache - it's called once per unique params
4. **Shared resolution**: Both `nitroEntityRoute` and `nitroEntityGenerateMetadata` use the same cached result
5. **Flexible rendering**: Provide a custom render function or use the default simple renderer

This pattern works with any route structure: `[slug]`, `[id]`, `[uniqueid]`, `[whatever]` - you control the resolution logic!

### 11. Sitemap Generation

Nitro provides a helper function to automatically generate a Next.js sitemap from your Flyo CMS content. The sitemap includes all pages and mapped entities.

#### Setup

First, ensure your `flyo.config.tsx` includes the `baseUrl` parameter:

```tsx
export const flyoConfig = initNitro({
  accessToken: process.env.FLYO_ACCESS_TOKEN || '',
  lang: 'en',
  baseUrl: process.env.SITE_URL || 'http://localhost:3000', // Required for sitemap
  liveEdit: process.env.FLYO_LIVE_EDIT === 'true',
  components: {
    // your components
  }
});
```

#### Create Sitemap File

Create `app/sitemap.ts`:

```ts
import { nitroSitemap } from '@flyo/nitro-next/server';
import { flyoConfig } from '../flyo.config';

export default async function sitemap() {
  return nitroSitemap(flyoConfig());
}
```

#### How it Works

1. **Fetches all content**: The `nitroSitemap` function fetches all pages and entities from the Flyo Nitro sitemap endpoint
2. **Uses configured baseUrl**: It constructs full URLs using the `baseUrl` from your Nitro configuration
3. **Handles routes**: Prioritizes the `routes` object from entities, falls back to `entity_slug`
4. **Returns Next.js format**: Outputs the standard `MetadataRoute.Sitemap` format that Next.js expects

#### Environment Variables

Set the `SITE_URL` environment variable for production:

```bash
# .env.production
SITE_URL=https://yourdomain.com
```

Next.js will automatically serve the sitemap at `/sitemap.xml`.

## API Reference

### Client Exports

- **`editable(block)`** – Returns the `data-flyo-uid` attributes to wire blocks into the Flyo live editor. **Client-only** — must be used in components with the `'use client'` directive.
  ```tsx
  import { editable } from '@flyo/nitro-next/client';
  ```
- **`FlyoClientWrapper`** – Internal wrapper that mounts the Nitro bridge, watches for new editable nodes, and wires the click/highlight handlers.
  ```tsx
  import { FlyoClientWrapper } from '@flyo/nitro-next/client';
  ```
- **`FlyoWysiwyg`** – Renders Flyo ProseMirror/TipTap JSON with optional overrides for individual node types.
  ```tsx
  import { FlyoWysiwyg } from '@flyo/nitro-next/client';
  ```
- **`FlyoCdnLoader`** – Image loader for Next.js Image component that optimizes images through Flyo CDN with automatic format conversion and resizing.
  ```tsx
  import { FlyoCdnLoader } from '@flyo/nitro-next/client';
  ```
- **`FlyoMetric`** – Component for tracking entity metrics in production. Automatically sends a metric tracking request to the Flyo API when in production environment and the entity has a metric API URL configured.
  ```tsx
  import { FlyoMetric } from '@flyo/nitro-next/client';
  ```
- **`isProd`** – Constant that checks if the current environment is production (`process.env.NODE_ENV === 'production'`).
  ```tsx
  import { isProd } from '@flyo/nitro-next/client';
  ```

### Server Exports

- **`initNitro(config)`** – Create and cache the Flyo configuration the rest of the helpers rely on.
  ```ts
  import { initNitro } from '@flyo/nitro-next/server';
  ```
- **`getNitroConfig()`** – Fetches and caches the Nitro configuration/metadata that describes the available pages.
  ```ts
  import { getNitroConfig } from '@flyo/nitro-next/server';
  ```
- **`getNitroPages()`** – Factory for the pages API that lets you fetch Nitro page data (used by `NitroPage`).
  ```ts
  import { getNitroPages } from '@flyo/nitro-next/server';
  ```
- **`getNitroEntities()`** – Factory for Nitro entities API (available via the Flyo Typescript SDK).
  ```ts
  import { getNitroEntities } from '@flyo/nitro-next/server';
  ```
- **`nitroPageRoute(props)`** – Default page route handler for Nitro pages. Renders a page from Flyo CMS.
  ```tsx
  import { nitroPageRoute } from '@flyo/nitro-next/server';
  ```
- **`nitroPageGenerateMetadata(props)`** – Generate metadata for Nitro pages using page data from Flyo.
  ```tsx
  import { nitroPageGenerateMetadata } from '@flyo/nitro-next/server';
  ```
- **`nitroPageGenerateStaticParams()`** – Generate static params for all Nitro pages to enable SSG.
  ```tsx
  import { nitroPageGenerateStaticParams } from '@flyo/nitro-next/server';
  ```
- **`nitroEntityRoute(props, options)`** – Flexible entity detail page handler that works with any route param structure. Takes a custom resolver function.
  ```tsx
  import { nitroEntityRoute } from '@flyo/nitro-next/server';
  ```
- **`nitroEntityGenerateMetadata(props, options)`** – Generate metadata for entity detail pages using a custom resolver function.
  ```tsx
  import { nitroEntityGenerateMetadata } from '@flyo/nitro-next/server';
  ```
- **`nitroSitemap(state)`** – Generate a Next.js sitemap from Flyo Nitro content. Takes the Nitro state (from `flyoConfig()`) as parameter.
  ```tsx
  import { nitroSitemap } from '@flyo/nitro-next/server';
  ```
- **`getNitro()`** – Access the current Nitro configuration state after initialization.
  ```tsx
  import { getNitro } from '@flyo/nitro-next/server';
  ```
- **`createProxy(state)`** – Create a Next.js middleware for cache control. Takes the Nitro state (from `flyoConfig()`) as parameter.
  ```tsx
  import { createProxy } from '@flyo/nitro-next/proxy';
  ```
- **`NitroPage`** – Server component that renders a whole Nitro page by delegating to `NitroBlock` for each block.
  ```tsx
  import { NitroPage } from '@flyo/nitro-next/server';
  ```
- **`NitroBlock`** – Low-level renderer that looks up and renders the registered component for a block, or shows a placeholder if missing.
  ```tsx
  import { NitroBlock } from '@flyo/nitro-next/server';
  ```
- **`NitroSlot`** – Renders nested blocks from a slot. Used for recursive block rendering when blocks contain slots with child blocks.
  ```tsx
  import { NitroSlot } from '@flyo/nitro-next/server';
  ```
- **`NitroEntityJsonLd`** – Server component that renders a JSON-LD `<script>` tag from an Entity's `jsonld` field for structured data / SEO. Safely escapes HTML to prevent XSS. Returns `null` if no jsonld data exists.
  ```tsx
  import { NitroEntityJsonLd } from '@flyo/nitro-next/server';
  ```
- **`NitroDebugInfo`** – Server component that outputs debug information about the Nitro setup as an HTML comment. Includes environment, API version, token type, and deployment details.
  ```tsx
  import { NitroDebugInfo } from '@flyo/nitro-next/server';
  ```

## Development

This is a workspace-based project using npm workspaces.

```bash
# Install dependencies
npm install

# run dev & start the playground
npm run dev
npm run playground
```
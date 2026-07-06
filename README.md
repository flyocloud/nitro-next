# Flyo Nitro for Next.Js

<p align="center">
  <img src="https://storage.flyo.cloud/12_K6uT5tY4TwXRL3_flyo-logo-colored.png" alt="Flyo" width="140" />
  &nbsp;&nbsp;&nbsp;&nbsp;
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/nextjs/nextjs-original.svg" alt="Next.js" width="160" />
</p>

> **⚠️ Important:** This library is designed exclusively for Next.js **App Router**. It requires server-side setup and is not compatible with the Pages Router. Make sure your Next.js project is using the App Router architecture.

<details>
<summary><strong>AI coding agent instructions — Next.js integration</strong></summary>

The file [ai-instructions-nextjs.md](ai-instructions-nextjs.md) contains a complete advisory for integrating Flyo Nitro CMS into an **existing Next.js App Router project** using `@flyo/nitro-next`.

It is written to be pasted directly into a coding agent (Claude, Copilot, Cursor, etc.) as a system prompt or task description.

**Copy the raw instructions:**

- GitHub raw URL: `https://raw.githubusercontent.com/flyocloud/nitro-nuxt/main/ai-instructions-nextjs.md`
- Or open [ai-instructions-nextjs.md](ai-instructions-nextjs.md) and use the **Raw** button.

The advisory covers:
- Package installation and `flyo.config.tsx` setup
- Proxy cache handling
- TypeScript type generation from the Flyo OpenAPI schema
- Layout `Header` and `Footer` components driven by Flyo containers
- Root layout integration with `FlyoProvider`
- Catch-all `app/[[...slug]]/page.tsx` route
- WYSIWYG and image helper components
- A reusable Claude skill (`.claude/skills/flyo-blocks/SKILL.md`) for block generation
- Sitemap support
- A final validation checklist

</details>

## Usage

### 1. Installation

```bash
npm install @flyo/nitro-next
```

### 2. Configuration

Create a `flyo.config.tsx` file. The `initNitro()` function returns a **Flyo instance** — an object that contains all the API methods and state for your app.

```tsx
import type { ReactNode } from 'react';
import { initNitro } from '@flyo/nitro-next/server';
import { FlyoClientWrapper } from '@flyo/nitro-next/client';
import { HeroBanner } from './components/HeroBanner';
import { Text } from './components/Text';

const accessToken = process.env.FLYO_ACCESS_TOKEN || '';
const liveEdit = process.env.FLYO_LIVE_EDIT === 'true';
const baseUrl = process.env.SITE_URL || 'http://localhost:3000';

// Create the Flyo instance — import this wherever you need CMS access
export const flyo = initNitro({
  accessToken,
  lang: 'en',
  baseUrl,
  liveEdit,
  serverCacheTtl: 1200,
  clientCacheTtl: 900,
  components: {
    HeroBanner,
    Text
  }
});

// Optional but recommended wrapper for live editing support
export function FlyoProvider({ children }: { children: ReactNode }) {
  if (liveEdit) {
    return <FlyoClientWrapper>{children}</FlyoClientWrapper>;
  }
  return <>{children}</>;
}
```

The `flyo` instance provides:
- `flyo.getNitroConfig()` — Fetch the CMS configuration
- `flyo.getNitroPages()` — Get the Pages API client
- `flyo.getNitroEntities()` — Get the Entities API client
- `flyo.getNitroSitemap()` — Get the Sitemap API client
- `flyo.getNitroSearch()` — Get the Search API client
- `flyo.pageResolveRoute(props)` — Resolve a page from route params
- `flyo.sitemap()` — Generate the sitemap
- `flyo.state` — Access the configuration state

### 3. Setup Proxy

Create a `proxy.ts` file in the `src/` directory to handle cache control:

```tsx
import { createProxy } from '@flyo/nitro-next/proxy';
import { flyo } from './flyo.config';

export default createProxy(flyo);

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

Use the Flyo instance in your `app/layout.tsx`:

```tsx
import Link from 'next/link';
import { FlyoProvider, flyo } from '@/flyo.config';
import { NitroDebugInfo } from '@flyo/nitro-next/server';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const config = await flyo.getNitroConfig();
  const navItems = config?.containers?.nav?.items ?? [];
  
  return (
    <FlyoProvider>
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

          <NitroDebugInfo flyo={flyo} />
          {children}
        </body>
      </html>
    </FlyoProvider>
  );
}
```

The `NitroDebugInfo` component outputs debug information as an HTML comment, including:
- Live edit status
- Environment mode
- API version and last update date
- Token type (production/develop)
- Deployment ID and commit SHA (Vercel)
- Release version (if set)

### 5. Create Page

Create a catch-all route in `app/[[...slug]]/page.tsx`. The factory functions take the `flyo` instance and return Next.js-compatible handlers:

```tsx
import { nitroPageRoute, nitroPageGenerateMetadata, nitroPageGenerateStaticParams } from "@flyo/nitro-next/server";
import { flyo } from "@/flyo.config";

export default nitroPageRoute(flyo);
export const generateMetadata = nitroPageGenerateMetadata(flyo);

// NOTE: generateStaticParams is commented out by default!
// 
// ⚠️ IMPORTANT: Only enable this in PRODUCTION builds!
// When enabled, Next.js will pre-render ALL pages at build time, which:
// - Disables dynamic caching completely
// - Prevents live preview updates in the Nitro CMS editor
//
// export const generateStaticParams = nitroPageGenerateStaticParams(flyo);
```

#### Custom Page Rendering

If you need to access the page data for custom logic (e.g. reading page properties, adding conditional wrappers, passing data to other components), use `flyo.pageResolveRoute()`:

```tsx
// app/[[...slug]]/page.tsx
import { NitroPage, nitroPageGenerateMetadata } from '@flyo/nitro-next/server';
import { flyo } from '@/flyo.config';

export const generateMetadata = nitroPageGenerateMetadata(flyo);

export default async function Page(props: { params: Promise<{ slug?: string[] }> }) {
  const { page, path, cfg } = await flyo.pageResolveRoute(props);

  // Access page data before rendering
  // page - the full Page object (page.title, page.meta_json, page.json, etc.)
  // path - the resolved URL path string
  // cfg  - the Flyo ConfigResponse

  return (
    <div>
      <h1>{page.title}</h1>
      {/* Render all blocks from the page */}
      <NitroPage page={page} flyo={flyo} />
    </div>
  );
}
```

The `flyo.pageResolveRoute()` function is React-cached — calling it in both `generateMetadata` and your page component will only trigger a single API request.

### 6. Generate Block Types

Flyo can generate fully typed TypeScript definitions for **every block, entity and container** in your Nitro project straight from the OpenAPI schema. This gives you autocomplete and type-safety when building components.

Add a `flyo:types` script to your `package.json`:

```json
{
  "scripts": {
    "flyo:types": "npx -y openapi-typescript@latest 'https://api.flyo.cloud/nitro/v1/openapi/schemas?token=<YOUR_TOKEN>' -o ./src/generated/flyo.ts --root-types --root-types-no-schema-prefix --export-type"
  }
}
```

Replace `<YOUR_TOKEN>` with your Flyo develop token. Then run:

```bash
npm run flyo:types
```

This writes `./src/generated/flyo.ts` containing a type for each of your blocks (for example `BlockHero`, `BlockText`, …), as well as your entities and containers.

What the flags do:
- `--root-types` / `--root-types-no-schema-prefix` — export each schema as a top-level type alias (e.g. `BlockHero`) instead of nesting it under `components['schemas']`.
- `--export-type` — emit `export type` aliases so you can import them directly.

> **Tip:** Re-run `npm run flyo:types` whenever you add or change block fields in the Nitro CMS so your types stay in sync. You can either commit the generated file or add it to `.gitignore` and regenerate it in CI.

Now you can type a component's `block` prop with the exact generated type instead of the generic `Block`:

```tsx
'use client';

import { editable } from "@flyo/nitro-next/client";
import type { BlockHero } from "@/src/generated/flyo";

export function FlyoHero({ block }: { block: BlockHero }) {
  return (
    <section {...editable(block)} className="bg-gray-200 p-8 rounded-lg text-center">
      <h2 className="text-3xl font-bold mb-4">{block?.content?.title}</h2>
      <p className="text-lg mb-6">{block?.content?.teaser}</p>
    </section>
  );
}
```

Using the generated `BlockHero` type gives you autocomplete on `block.content.*` and catches typos at build time. The next section uses the generic `Block` type for simplicity, but you can swap in a generated type anywhere a block is rendered.

### 7. Create Custom Components

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

### 8. WYSIWYG Component

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

### 9. Image Optimization with Flyo CDN

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

### 10. Nested Blocks (Slots)

When blocks contain nested blocks in slots, use the `NitroSlot` component to recursively render them. In v2, `NitroSlot` requires the `flyo` prop — import it from your config file:

```tsx
import { NitroSlot } from '@flyo/nitro-next/server';
import { flyo } from '@/flyo.config';
import { Block } from '@flyo/nitro-typescript';

export function Container({ block }: { block: Block }) {
  return (
    <div className="container">
      <h2>{block.content?.title}</h2>
      {/* Render nested blocks from the slot */}
      <NitroSlot slot={block.slots?.content} flyo={flyo} />
    </div>
  );
}
```

> Keep in mind that `NitroSlot` can only be used in server components, as it relies on server-side rendering of blocks.

The `NitroSlot` component automatically handles:
- Iterating over nested blocks
- Recursively rendering each block using `NitroBlock`
- Supporting unlimited nesting depth

#### Combining `editable()` with Slots

Because `editable()` requires `'use client'` and `NitroSlot` is server-only, you cannot use both in the same file. The `EditableSection` component solves this by acting as a thin client wrapper that applies the editable data attribute, while accepting server-rendered children (including `NitroSlot`) via the `children` prop.

This works because Next.js supports passing server-rendered React trees into client components through props like `children`.

```tsx
// components/HeroBanner.tsx  (server component – no 'use client' needed)
import { Block } from '@flyo/nitro-typescript';
import { NitroSlot } from '@flyo/nitro-next/server';
import { EditableSection } from '@flyo/nitro-next/client';
import { flyo } from '@/flyo.config';

export function HeroBanner({ block }: { block: Block }) {
  return (
    <EditableSection block={block} className="bg-gray-200 p-8 rounded-lg text-center">
      <h2 className="text-3xl font-bold mb-4">
        {block?.content?.title}
      </h2>
      <p className="text-lg mb-6">
        {block?.content?.teaser}
      </p>
      <NitroSlot slot={block.slots?.content} flyo={flyo} />
    </EditableSection>
  );
}
```

`EditableSection` accepts an optional `as` prop to change the wrapper element (defaults to `<section>`):

```tsx
<EditableSection block={block} as="div" className="card">
  {/* ... */}
</EditableSection>
```

> **Why this works:** Only the minimal wrapper becomes a client component. The heavy recursive slot rendering stays on the server. Props passed into a client component must be serializable — plain CMS JSON objects like `block` are fine.

### 11. Entity Detail Pages

Nitro provides flexible helpers for creating entity detail pages with any route structure. You define a **resolver function** that fetches the entity from your route params, and the library handles caching and rendering.

#### Example 1: Entity by Slug

Create `app/blog/[slug]/page.tsx`:

```tsx
import { 
  nitroEntityRoute, 
  nitroEntityGenerateMetadata, 
  NitroEntityJsonLd,
  type EntityResolver
} from "@flyo/nitro-next/server";
import { flyo } from "@/flyo.config";
import { FlyoMetric } from "@flyo/nitro-next/client";
import type { Entity } from "@flyo/nitro-typescript";

// Define how to resolve the entity from route params
const resolver: EntityResolver<{ slug: string }> = async (params) => {
  const { slug } = await params;
  return flyo.getNitroEntities().entityBySlug({ 
    slug, 
    typeId: 123 // Your entity type ID from Flyo
  });
};

// Factory functions return Next.js-compatible handlers
export const generateMetadata = nitroEntityGenerateMetadata(flyo, { resolver });

export default nitroEntityRoute(flyo, {
  resolver,
  render: (entity: Entity) => (
    <>
      <NitroEntityJsonLd entity={entity} />
      <FlyoMetric entity={entity} />
      <article>
        <h1>{entity.entity?.entity_title}</h1>
        <p>{entity.entity?.entity_teaser}</p>
      </article>
    </>
  )
});
```

#### Example 2: Entity by Unique ID

Create `app/items/[uniqueid]/page.tsx`:

```tsx
import { 
  nitroEntityRoute, 
  nitroEntityGenerateMetadata, 
  NitroEntityJsonLd,
  type EntityResolver
} from "@flyo/nitro-next/server";
import { flyo } from "@/flyo.config";
import { FlyoMetric } from "@flyo/nitro-next/client";
import type { Entity } from "@flyo/nitro-typescript";

const resolver: EntityResolver<{ uniqueid: string }> = async (params) => {
  const { uniqueid } = await params;
  return flyo.getNitroEntities().entityByUniqueid({ uniqueid });
};

export const generateMetadata = nitroEntityGenerateMetadata(flyo, { resolver });

export default nitroEntityRoute(flyo, {
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
```

#### Example 3: Custom Route Parameter Name

Works with any route parameter name - create `app/products/[id]/page.tsx`:

```tsx
import { 
  nitroEntityRoute, 
  nitroEntityGenerateMetadata, 
  NitroEntityJsonLd,
  type EntityResolver
} from "@flyo/nitro-next/server";
import { flyo } from "@/flyo.config";
import { FlyoMetric } from "@flyo/nitro-next/client";
import type { Entity } from "@flyo/nitro-typescript";

const resolver: EntityResolver<{ id: string }> = async (params) => {
  const { id } = await params;
  return flyo.getNitroEntities().entityBySlug({ 
    slug: id,
    typeId: 456
  });
};

export const generateMetadata = nitroEntityGenerateMetadata(flyo, { resolver });

export default nitroEntityRoute(flyo, {
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
```

#### How it Works

1. **Type-safe params**: Define your route params type to match your Next.js route structure
2. **Custom resolver**: Write a function that takes the params and returns an entity
3. **Automatic caching**: The resolver is automatically wrapped with React cache - it's called once per unique params
4. **Shared resolution**: Both `nitroEntityRoute` and `nitroEntityGenerateMetadata` use the same cached result
5. **Flexible rendering**: Provide a custom render function or use the default simple renderer

This pattern works with any route structure: `[slug]`, `[id]`, `[uniqueid]`, `[whatever]` - you control the resolution logic!

### 12. Sitemap Generation

Nitro provides automatic sitemap generation using the Flyo instance:

#### Setup

Ensure your config includes the `baseUrl`:

```tsx
export const flyo = initNitro({
  accessToken: process.env.FLYO_ACCESS_TOKEN || '',
  baseUrl: process.env.SITE_URL || 'http://localhost:3000',
  // ...
});
```

#### Create Sitemap File

Create `app/sitemap.ts`:

```ts
import { flyo } from '@/flyo.config';

export default async function sitemap() {
  return flyo.sitemap();
}
```

#### How it Works

1. **Fetches all content**: The `flyo.sitemap()` method fetches all pages and entities from the Flyo Nitro sitemap endpoint
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
- **`EditableSection`** – Thin client wrapper that applies `editable()` to a root element while accepting server-rendered children (e.g. `NitroSlot`). Use this when you need both `editable()` and slots in the same component. Accepts an optional `as` prop to change the wrapper element (defaults to `<section>`).
  ```tsx
  import { EditableSection } from '@flyo/nitro-next/client';
  ```
- **`isProd`** – Constant that checks if the current environment is production (`process.env.NODE_ENV === 'production'`).
  ```tsx
  import { isProd } from '@flyo/nitro-next/client';
  ```

### Server Exports

- **`initNitro(config)`** – Create a Flyo instance with all API methods and state. Returns a `FlyoInstance`.
  ```ts
  import { initNitro } from '@flyo/nitro-next/server';
  const flyo = initNitro({ accessToken: '...' });
  ```
- **`nitroPageRoute(flyo)`** – Factory that returns a page route handler for Nitro pages.
  ```tsx
  import { nitroPageRoute } from '@flyo/nitro-next/server';
  export default nitroPageRoute(flyo);
  ```
- **`nitroPageGenerateMetadata(flyo)`** – Factory that returns a metadata generator for Nitro pages.
  ```tsx
  import { nitroPageGenerateMetadata } from '@flyo/nitro-next/server';
  export const generateMetadata = nitroPageGenerateMetadata(flyo);
  ```
- **`nitroPageGenerateStaticParams(flyo)`** – Factory that returns a static params generator for SSG.
  ```tsx
  import { nitroPageGenerateStaticParams } from '@flyo/nitro-next/server';
  export const generateStaticParams = nitroPageGenerateStaticParams(flyo);
  ```
- **`nitroEntityRoute(flyo, options)`** – Factory that returns an entity detail page handler. Takes a resolver function and optional render function.
  ```tsx
  import { nitroEntityRoute } from '@flyo/nitro-next/server';
  export default nitroEntityRoute(flyo, { resolver, render });
  ```
- **`nitroEntityGenerateMetadata(flyo, options)`** – Factory that returns a metadata generator for entity detail pages.
  ```tsx
  import { nitroEntityGenerateMetadata } from '@flyo/nitro-next/server';
  export const generateMetadata = nitroEntityGenerateMetadata(flyo, { resolver });
  ```
- **`createProxy(flyo)`** – Create a Next.js middleware for cache control.
  ```tsx
  import { createProxy } from '@flyo/nitro-next/proxy';
  export default createProxy(flyo);
  ```
- **`NitroPage`** – Server component that renders a whole Nitro page by delegating to `NitroBlock` for each block. Requires `flyo` prop.
  ```tsx
  import { NitroPage } from '@flyo/nitro-next/server';
  <NitroPage page={page} flyo={flyo} />
  ```
- **`NitroBlock`** – Low-level renderer that looks up and renders the registered component for a block. Requires `flyo` prop.
  ```tsx
  import { NitroBlock } from '@flyo/nitro-next/server';
  <NitroBlock block={block} flyo={flyo} />
  ```
- **`NitroSlot`** – Renders nested blocks from a slot. Used for recursive block rendering. Requires `flyo` prop.
  ```tsx
  import { NitroSlot } from '@flyo/nitro-next/server';
  <NitroSlot slot={block.slots?.content} flyo={flyo} />
  ```
- **`NitroEntityJsonLd`** – Server component that renders a JSON-LD `<script>` tag from an Entity's `jsonld` field for structured data / SEO. Safely escapes HTML to prevent XSS.
  ```tsx
  import { NitroEntityJsonLd } from '@flyo/nitro-next/server';
  ```
- **`NitroDebugInfo`** – Async server component that outputs debug information as an HTML comment. Requires `flyo` prop.
  ```tsx
  import { NitroDebugInfo } from '@flyo/nitro-next/server';
  <NitroDebugInfo flyo={flyo} />
  ```

### FlyoInstance Methods

After calling `initNitro()`, the returned instance exposes:

| Method | Returns | Description |
|--------|---------|-------------|
| `flyo.getNitroConfig()` | `Promise<ConfigResponse>` | Fetch the CMS config (React-cached) |
| `flyo.getNitroPages()` | `PagesApi` | Get the Pages API client |
| `flyo.getNitroEntities()` | `EntitiesApi` | Get the Entities API client |
| `flyo.getNitroSitemap()` | `SitemapApi` | Get the Sitemap API client |
| `flyo.getNitroSearch()` | `SearchApi` | Get the Search API client |
| `flyo.pageResolveRoute(props)` | `Promise<{ page, path, cfg }>` | Resolve a page from route params (React-cached) |
| `flyo.sitemap()` | `Promise<MetadataRoute.Sitemap>` | Generate the Next.js sitemap |
| `flyo.state` | `NitroState` | Access the configuration state |

## Development

This is a workspace-based project using npm workspaces.

```bash
# Install dependencies
npm install

# run dev & start the playground
npm run dev
npm run playground
```

## Example `CLAUDE.md`

If you build your project with an AI coding assistant (such as Claude Code), drop a `CLAUDE.md` file in your project root so the assistant understands your stack and knows where to find the Flyo/Nitro documentation. Here is a minimal starting point you can copy and adapt:

```markdown
# Flyo

This is the new XYZ website of XYZ.

It uses the Headless CMS, Flyo Nitro, to manage the content of the website. The full documentation for Nitro CMS can be found here: https://docs.flyo.cloud/doc/integrations-nitro-cms

The Flyo Nitro CMS Next.js plugin/extension documentation can be found here: https://github.com/flyocloud/nitro-next regarding blocks, entities, and more.
```
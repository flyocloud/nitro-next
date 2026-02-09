# AI Instructions: Building a Next.js Website with Flyo Nitro Headless CMS

> **Step-by-step guide for AI assistants to scaffold a Next.js App Router website powered by Flyo Nitro headless CMS using `@flyo/nitro-next`.**

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites & User-Provided Data](#2-prerequisites--user-provided-data)
3. [Project Setup](#3-project-setup)
4. [Environment Variables](#4-environment-variables)
5. [Flyo Configuration File](#5-flyo-configuration-file)
6. [Middleware Proxy](#6-middleware-proxy)
7. [Root Layout with Navigation](#7-root-layout-with-navigation)
8. [Catch-All Page Route](#8-catch-all-page-route)
9. [Building Block Components](#9-building-block-components)
10. [Entity Detail Pages](#10-entity-detail-pages)
11. [Not Found Page](#11-not-found-page)
12. [Sitemap Generation](#12-sitemap-generation)
13. [Image Optimization](#13-image-optimization)
14. [API Reference Summary](#14-api-reference-summary)
15. [Common Mistakes to Avoid](#15-common-mistakes-to-avoid)
16. [Bolt.new / StackBlitz Deployment](#16-boltnew--stackblitz-deployment)

---

## 1. Architecture Overview

Flyo Nitro is a headless CMS delivering content through a REST API with three pillars:

- **Config** (`/config`): Navigation containers, available page slugs, global content pools.
- **Pages** (`/pages?slug=...`): Page content by slug. Each page has a `json` array of **blocks** rendered by matching their `component` field to registered React components.
- **Entities** (`/entities/slug/{slug}` or `/entities/uniqueid/{uniqueid}`): Standalone data objects (blog posts, products, etc.) with their own detail pages.

### How Pages Work

Each block in the page's `json` array has:
- `component`: React component name (e.g., `"HeroBanner"`, `"Text"`)
- `content`: Content data for the component
- `config`: Configuration/styling options
- `items`: Mapped entity data (content pool items)
- `slots`: Nested child blocks (for container components)
- `identifier`: Block type identifier in the CMS
- `uid`: Unique block ID (for live editing)

The library iterates over `json` and renders the matching React component for each block. **You only need a single catch-all route `[[...slug]]/page.tsx`.**

### Key Concept: Component Mapping

In `flyo.config.tsx`, you register a map of `component` name → React component. The key must **exactly match** the `component` string from the API (case-sensitive).

---

## 2. Prerequisites & User-Provided Data

You need two pieces of data from the user, plus the auto-generated OpenAPI schemas.

### A) Flyo Access Token

The API token for authenticating with the Flyo Nitro API.

```
INSERT_YOUR_FLYO_ACCESS_TOKEN_HERE
```

### B) Config API Response

Fetch from: `https://api.flyo.cloud/nitro/v1/config?token=YOUR_TOKEN`

This provides:
- **Navigation containers** (`containers` object): Each key (e.g., `"nav"`, `"footer"`) has `items` — page links with `label`, `href`, `slug`, `children`, `properties`.
- **Available pages** (`pages` array): Valid slugs. Empty string `""` = homepage.
- **Globals** (`globals` object): Site-wide content pool data.

```json
INSERT_YOUR_CONFIG_RESPONSE_HERE
```

### C) OpenAPI Block & Entity Schemas

Fetch from: `https://api.flyo.cloud/nitro/v1/openapi/schemas?token=YOUR_TOKEN`

This endpoint returns an **OpenAPI 3.0 specification** with typed schemas for all block definitions and entity models specific to this project.

```json
INSERT_YOUR_OPENAPI_SCHEMAS_RESPONSE_HERE
```

The schemas tell you exactly:

- **Which block components exist** — schemas named `Block{ComponentName}` (e.g., `BlockHeroBanner`, `BlockText`)
- **What content fields each block has** — the `content` property with typed sub-properties
- **What items each block receives** — the `items` array schema with typed item fields
- **What config options exist** — the `config` property with typed fields
- **What slots are available** — the `slots` property with named slot containers
- **What entity models exist** — schemas named `Entity{Name}` (e.g., `EntityTiere`) with their field mappings

#### How to Read the OpenAPI Schemas

Each `Block*` schema has this structure:
```
BlockComponentName:
  properties:
    identifier  → CMS-internal block type name (enum with single value)
    component   → React component name to register (enum with single value)
    content     → Object with typed content fields (image, title, teaser, etc.)
    config      → Object with typed configuration fields
    items       → Array with typed item schemas (for content pool blocks)
    slots       → Object with named slot containers (for nested blocks)
```

Each `Entity*` schema describes an entity model:
```
EntityName:
  properties:
    field_name → typed field (string, object, etc.)
```

> **Key**: If a property section only has `_empty: boolean`, it means that section is unused for that block.

---

## 3. Project Setup

```bash
npm install @flyo/nitro-next
```

> **CRITICAL**: Requires **Next.js App Router** (`app/` directory, not `pages/`). Requires **Next.js >= 16.0.4**, **React >= 19.2.1**, **React DOM >= 19.2.1**.

### Folder Structure

```
src/
├── flyo.config.tsx          # Flyo configuration & component registry
├── proxy.ts                 # Cache control middleware
├── app/
│   ├── layout.tsx           # Root layout with navigation
│   ├── not-found.tsx        # 404 page
│   ├── sitemap.ts           # Auto-generated sitemap
│   └── [[...slug]]/
│       └── page.tsx         # ← THE ONLY PAGE ROUTE NEEDED
└── components/
    ├── HeroBanner.tsx       # One component per Block* schema
    ├── Text.tsx
    ├── CardsGrid.tsx
    └── ...
```

---

## 4. Environment Variables

Create `.env.local`:

```bash
FLYO_ACCESS_TOKEN=INSERT_YOUR_FLYO_ACCESS_TOKEN_HERE
FLYO_LIVE_EDIT=true
SITE_URL=http://localhost:3000
```

---

## 5. Flyo Configuration File

Create `src/flyo.config.tsx`:

```tsx
import type { ReactNode } from 'react';
import { initNitro } from '@flyo/nitro-next/server';
import { FlyoClientWrapper } from '@flyo/nitro-next/client';

// Import ALL block components (one per Block* schema)
import { HeroBanner } from './components/HeroBanner';
import { Text } from './components/Text';
// import { CardsGrid } from './components/CardsGrid';
// import { SlotContainer } from './components/SlotContainer';

const accessToken = process.env.FLYO_ACCESS_TOKEN || '';
const liveEdit = process.env.FLYO_LIVE_EDIT === 'true';
const baseUrl = process.env.SITE_URL || 'http://localhost:3000';

export const flyoConfig = initNitro({
  accessToken,
  lang: 'de',           // ← Match config response's nitro.language
  baseUrl,
  liveEdit,
  serverCacheTtl: 1200,
  clientCacheTtl: 900,
  // Keys MUST match the "component" enum from each Block* schema exactly
  components: {
    HeroBanner: HeroBanner,
    Text: Text,
    // CardsGrid: CardsGrid,
    // SlotContainer: SlotContainer,
  }
});

export function Flyo({ children }: { children: ReactNode }) {
  flyoConfig();
  if (liveEdit) {
    return <FlyoClientWrapper>{children}</FlyoClientWrapper>;
  }
  return children;
}
```

### How to Determine What to Register

Look at the OpenAPI schemas. For each `Block*` schema, read the `component` enum value — that's the key you register. Create one React component per `Block*` schema.

---

## 6. Middleware Proxy

Create `src/proxy.ts`:

```ts
import { createProxy } from '@flyo/nitro-next/proxy';
import { flyoConfig } from './flyo.config';

export default createProxy(flyoConfig());

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

Sets `Cache-Control` headers based on TTL config. Disables caching when `liveEdit` is `true`.

> **Note**: The proxy IS the Next.js middleware. Place at `src/proxy.ts` (or `src/middleware.ts`).

---

## 7. Root Layout with Navigation

Create `src/app/layout.tsx`:

```tsx
import { Flyo } from '@/flyo.config';
import type { ReactNode } from 'react';
import { getNitroConfig, NitroDebugInfo } from '@flyo/nitro-next/server';
import Link from 'next/link';
import type { ContainerPage } from '@flyo/nitro-typescript';

export default async function RootLayout({ children }: { children: ReactNode }) {
  const config = await getNitroConfig();

  // Use the container identifier from your config response (e.g., "nav")
  const navContainer = config?.containers?.nav;
  const navItems: ContainerPage[] = navContainer && !Array.isArray(navContainer)
    ? (navContainer.items || [])
    : [];

  return (
    <Flyo>
      <html lang={config?.nitro?.language || 'en'}>
        <body>
          <NitroDebugInfo config={config} />
          <header>
            <nav>
              <ul style={{ display: 'flex', gap: '1rem', listStyle: 'none', padding: '1rem' }}>
                {navItems.map((item: ContainerPage, index: number) => (
                  <li key={index}>
                    <Link href={item.href || '#'} target={item.target}>{item.label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          </header>
          <main>{children}</main>
        </body>
      </html>
    </Flyo>
  );
}
```

### Multiple Containers & Nested Navigation

Access other containers by identifier (e.g., `config?.containers?.footer`). For nested navigation with `children`:

```tsx
function NavItem({ item }: { item: ContainerPage }) {
  return (
    <li>
      <Link href={item.href || '#'}>{item.label}</Link>
      {item.children && item.children.length > 0 && (
        <ul>{item.children.map((child, i) => <NavItem key={i} item={child} />)}</ul>
      )}
    </li>
  );
}
```

Global data: `config?.globals?.locations || []`

---

## 8. Catch-All Page Route

Create `src/app/[[...slug]]/page.tsx`:

```tsx
export {
  nitroPageRoute as default,
  nitroPageGenerateMetadata as generateMetadata,
} from '@flyo/nitro-next/server';
```

**That's it.** Handles homepage (`/`), all CMS pages, 404s, and SEO metadata.

### Static Site Generation (Production Only)

```tsx
export {
  nitroPageRoute as default,
  nitroPageGenerateMetadata as generateMetadata,
  nitroPageGenerateStaticParams as generateStaticParams,
} from '@flyo/nitro-next/server';
```

> **WARNING**: `generateStaticParams` disables live preview. Only enable for production.

---

## 9. Building Block Components

For each `Block*` schema in the OpenAPI response, create a React component. Every component receives a `block` prop of type `Block`.

### General Pattern

> **CRITICAL**: Every component that uses `editable()` **must** include `'use client'` as the very first line of the file. `editable()` is a client-only function imported from `@flyo/nitro-next/client` — using it in a server component will cause a runtime error. This is the single most common mistake when generating code with AI tools.

```tsx
'use client'; // ← REQUIRED: editable() is client-only

import { Block } from '@flyo/nitro-typescript';
import { editable } from '@flyo/nitro-next/client';

export function ComponentName({ block }: { block: Block }) {
  return (
    <div {...editable(block)}>
      {/* Render block.content fields based on the Block* schema */}
    </div>
  );
}
```

**Rules:**
- Components must be `'use client'` (they use `editable()`). **`editable()` is a client-only function** — it will fail if used in a server component without the `'use client'` directive at the top of the file.
- Always spread `{...editable(block)}` on the root element for live editing
- Access: `block.content.fieldName`, `block.items` (array), `block.config.fieldName`, `block.slots.slotName`
- **Exception**: Components using `NitroSlot` must be **server components** (no `'use client'`, no `editable()`)

### Example: HeroBanner (content fields)

Schema shows: `content.image` (object), `content.title` (string), `content.teaser` (string)

```tsx
'use client';

import { Block } from '@flyo/nitro-typescript';
import { editable } from '@flyo/nitro-next/client';

export function HeroBanner({ block }: { block: Block }) {
  return (
    <section {...editable(block)} style={{ textAlign: 'center', padding: '2rem' }}>
      <h2>{block?.content?.title}</h2>
      <p>{block?.content?.teaser}</p>
      {block?.content?.image?.source && (
        <img src={block.content.image.source} alt={block.content.image.caption || ''} style={{ maxWidth: '100%' }} />
      )}
    </section>
  );
}
```

### Example: Text/WYSIWYG (rich text content)

Schema shows: `content.content` with `html` (string) and `json` (TipTap JSON)

```tsx
'use client';

import { Block } from '@flyo/nitro-typescript';
import { editable, FlyoWysiwyg } from '@flyo/nitro-next/client';

export function Text({ block }: { block: Block }) {
  return (
    <div {...editable(block)} style={{ padding: '1rem', margin: '2rem 0' }}>
      <FlyoWysiwyg json={block.content.content.json} />
    </div>
  );
}
```

> Use `FlyoWysiwyg` with the `json` field (TipTap format) for proper rendering. Alternative: `block.content.content.html` with `dangerouslySetInnerHTML`.

### Example: CardsGrid (items-based block)

Schema shows: `content._empty` (unused), `items` array with `title`, `teaser`, `image`

```tsx
'use client';

import { Block } from '@flyo/nitro-typescript';
import { editable } from '@flyo/nitro-next/client';

export function CardsGrid({ block }: { block: Block }) {
  return (
    <div {...editable(block)} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem', padding: '1rem' }}>
      {block?.items?.map((item: any, index: number) => (
        <div key={index} style={{ border: '1px solid #ddd', borderRadius: '8px', overflow: 'hidden' }}>
          {item.image?.source && (
            <img src={item.image.source} alt={item.title || ''} style={{ width: '100%', height: '200px', objectFit: 'cover' }} />
          )}
          <div style={{ padding: '1rem' }}>
            <h3>{item.title}</h3>
            <p>{item.teaser}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
```

### Example: SlotContainer (nested blocks — server component)

Schema shows: `slots.content` with nested block array

```tsx
// NO 'use client' — this is a server component
import { Block } from '@flyo/nitro-typescript';
import { NitroSlot } from '@flyo/nitro-next/server';

export function SlotContainer({ block }: { block: Block }) {
  return (
    <div>
      <NitroSlot slot={block.slots?.content} />
    </div>
  );
}
```

> `NitroSlot` must be used in server components only. It renders nested blocks recursively.

---

## 10. Entity Detail Pages

Entity models are described by `Entity*` schemas in the OpenAPI response (e.g., `EntityTiere`). To create detail pages for entities:

Create a dynamic route, e.g., `src/app/tiere/[slug]/page.tsx`:

```tsx
import { nitroEntityRoute, nitroEntityGenerateMetadata } from '@flyo/nitro-next/server';

const entityOptions = {
  // The OpenAPI entity schema tells you what fields are available
  resolver: async (entity: any) => {
    return <div>
      <h1>{entity.title}</h1>
      <p>{entity.long_text}</p>
    </div>;
  }
};

export default function EntityPage(props: any) {
  return nitroEntityRoute(props, entityOptions);
}

export function generateMetadata(props: any) {
  return nitroEntityGenerateMetadata(props, entityOptions);
}
```

The entity's available fields come from the `Entity*` schema in the OpenAPI response. Use `nitroEntityRoute` to fetch and render entity data, and `nitroEntityGenerateMetadata` for SEO.

---

## 11. Not Found Page

Create `src/app/not-found.tsx`:

```tsx
export default function NotFoundPage() {
  return <h1>Page not found</h1>;
}
```

---

## 12. Sitemap Generation

Create `src/app/sitemap.ts`:

```ts
import { nitroSitemap } from '@flyo/nitro-next/server';
import { flyoConfig } from '../flyo.config';

export default async function sitemap() {
  return nitroSitemap(flyoConfig());
}
```

---

## 13. Image Optimization

Use `FlyoCdnLoader` with Next.js `Image` for Flyo CDN optimization:

```tsx
'use client';

import Image from 'next/image';
import { FlyoCdnLoader } from '@flyo/nitro-next/client';

<Image
  loader={FlyoCdnLoader}
  src={block.content.image.source}
  alt={block.content.image.caption || ''}
  width={800}
  height={600}
/>
```

---

## 14. API Reference Summary

### `@flyo/nitro-next/server`

| Export | Description |
|--------|-------------|
| `initNitro(config)` | Initialize Flyo configuration. Returns a function returning `NitroState`. |
| `getNitroConfig()` | Fetch/cache config response (navigation, pages, globals). |
| `getNitroPages()` | Pages API instance for fetching page data. |
| `getNitroEntities()` | Entities API instance for fetching entity data. |
| `getNitroSearch()` | Search API instance. |
| `getNitro()` | Access current Nitro state. |
| `nitroPageRoute` | Default page route handler for `[[...slug]]/page.tsx`. |
| `nitroPageGenerateMetadata` | Generate SEO metadata for pages. |
| `nitroPageGenerateStaticParams` | Generate static params for SSG (production only). |
| `nitroEntityRoute(props, options)` | Entity detail page handler. |
| `nitroEntityGenerateMetadata(props, options)` | Generate metadata for entity pages. |
| `nitroSitemap(state)` | Generate sitemap from CMS content. |
| `NitroPage` | Server component: renders all blocks on a page. |
| `NitroBlock` | Server component: renders a single block. |
| `NitroSlot` | Server component: renders nested blocks from a slot. |
| `NitroDebugInfo` | Server component: outputs debug info as HTML comment. |

### `@flyo/nitro-next/client`

| Export | Description |
|--------|-------------|
| `editable(block)` | Returns data attributes for live editor. Spread on root element. |
| `FlyoClientWrapper` | Wrapper for live editing mode. |
| `FlyoWysiwyg` | Renders TipTap JSON content with optional custom node components. |
| `FlyoCdnLoader` | Image loader for Next.js Image with Flyo CDN. |
| `FlyoMetric` | Tracking component for entity metrics (production only). |

### `@flyo/nitro-next/proxy`

| Export | Description |
|--------|-------------|
| `createProxy(state)` | Create Next.js middleware for cache control. |

### `@flyo/nitro-typescript`

| Export | Description |
|--------|-------------|
| `Block` | TypeScript type for a page block. |
| `Entity` | TypeScript type for an entity. |
| `Page` | TypeScript type for a page. |
| `ConfigResponse` | TypeScript type for config API response. |
| `ContainerPage` | TypeScript type for a navigation container page item. |

---

## 15. Common Mistakes to Avoid

1. **Missing component registration**: Every `Block*` schema's `component` value must be registered in `initNitro({ components })`.
2. **Wrong component key**: Keys must **exactly match** the `component` enum (case-sensitive). `"HeroBanner"` ≠ `"heroBanner"`.
3. **Using Pages Router**: Only **App Router** (`app/` directory) is supported.
4. **Forgetting `'use client'`**: Components using `editable()`, `FlyoWysiwyg`, `FlyoCdnLoader` **must** have `'use client'` at the very top of the file. `editable()` is a client-only function and will break if used in a server component. This is the most common mistake made by AI code generators.
5. **`NitroSlot` in client components**: `NitroSlot` is server-only. No `'use client'` on slot components.
6. **`generateStaticParams` in development**: Disables live preview. Production only.
7. **Forgetting `editable(block)`**: Always spread on root element for live editing. Remember: `editable()` requires `'use client'`.
8. **Wrong image structure**: Images are `{source, caption, copyright}` objects, not strings. Use `.source` for the URL.
9. **Wrong WYSIWYG image src**: In WYSIWYG nodes, `node.attrs.src` is also `{source, caption, copyright}`. Use `.source`.
10. **Not wrapping layout with `<Flyo>`**: Root layout must use the `<Flyo>` wrapper.
11. **Hardcoding navigation**: Use `config.containers` dynamically.
12. **Creating multiple page routes**: Only ONE catch-all `[[...slug]]/page.tsx`. No separate routes for CMS pages.

---

## 16. Bolt.new / StackBlitz Deployment

> **Bolt.new** and **StackBlitz** run Node.js inside the browser using **WebContainers** (a WASM-based runtime). This causes specific compatibility issues with Next.js 16 that must be addressed.

### Problem: Turbopack WASM Bindings

Next.js 16 enables **Turbopack** by default for `next dev` and `next build`. Turbopack relies on native SWC binaries (`turbo.createProject`), which **do not work** in WebContainer environments. You will see:

```
Error: `turbo.createProject` is not supported by the wasm bindings.
```

**Fix**: Use the `--webpack` flag to bypass Turbopack entirely.

### Problem: Peer Dependency Conflicts with React 19

Many popular npm packages (e.g., `next-themes@0.3.x`, `react-day-picker@8.x`) declare `peerDependencies` that only allow React 16–18. Since `@flyo/nitro-next` requires **React >= 19.2.1**, `npm install` will fail with `ERESOLVE unable to resolve dependency tree`.

**Fix**: Create an `.npmrc` file and/or use compatible package versions.

### Problem: `@next/swc-wasm-nodejs`

Bolt.new may auto-install `@next/swc-wasm-nodejs` (often an outdated version like `13.x`) which conflicts with Next.js 16. **Never add this package manually.**

---

### Required Configuration for Bolt.new

#### A) `package.json` Scripts — Use `--webpack` Flag

```json
{
  "scripts": {
    "dev": "next dev --webpack",
    "build": "next build --webpack",
    "start": "next start",
    "lint": "next lint"
  }
}
```

> **CRITICAL**: The `--webpack` flag tells Next.js to use Webpack instead of Turbopack. This is the **only** way to run Next.js 16 in WebContainer environments (Bolt.new, StackBlitz). Without it, the app will crash immediately.

#### B) `.npmrc` — Fix Peer Dependency Resolution

Create `.npmrc` in the project root:

```
legacy-peer-deps=true
```

This allows npm to install packages even when their `peerDependencies` don't explicitly list React 19. Without this file, `npm install` will fail.

#### C) `next.config.js` — Required Image Config

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.flyo.cloud',
      },
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
      },
    ],
  },
};

module.exports = nextConfig;
```

#### D) Do NOT Install These Packages

- `@next/swc-wasm-nodejs` — Conflicts with Next.js 16. Remove if already present.
- `@next/swc-wasm-wasm32` — Same issue.

If you see these in `package.json`, remove them:

```bash
npm uninstall @next/swc-wasm-nodejs @next/swc-wasm-wasm32
```

#### E) Third-Party Package Compatibility

When using React 19 in Bolt.new, prefer package versions that support React 19. Common fixes:

| Package | Problematic Version | Fix |
|---------|-------------------|-----|
| `next-themes` | `0.3.x` (peer: React 16–18) | Use `next-themes@^0.4.4` |
| `react-day-picker` | `8.x` (peer: React 16–18) | Use `react-day-picker@^9.0.0` or rely on `.npmrc` |
| `@radix-ui/*` | Old versions | Use latest versions (most now support React 19) |

#### F) Minimal `package.json` for Bolt.new

Use the **minimum dependencies** needed. Avoid adding unnecessary packages. Here is a clean starting point:

```json
{
  "name": "flyo-nextjs",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --webpack",
    "build": "next build --webpack",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "@flyo/nitro-next": "^1.8.0",
    "next": "^16.0.4",
    "react": "^19.2.1",
    "react-dom": "^19.2.1"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "@types/react": "^19.2.1",
    "@types/react-dom": "^19.2.1",
    "typescript": "^5.3.0"
  }
}
```

Add additional packages (Tailwind CSS, Radix UI, etc.) only as needed, and confirm they support React 19 before adding.

### Bolt.new Checklist

- [ ] `.npmrc` with `legacy-peer-deps=true` exists in project root
- [ ] `package.json` scripts use `--webpack` flag for `dev` and `build`
- [ ] `@next/swc-wasm-nodejs` is **NOT** in `package.json`
- [ ] `next-themes` version is `^0.4.4` (not `0.3.x`) if used
- [ ] `next.config.js` has `images.remotePatterns` for `**.flyo.cloud`
- [ ] Keep dependencies minimal — only add what you need
- [ ] After `npm install` errors, run `npm install --legacy-peer-deps`

### Bolt.new Prompt Tip

When prompting Bolt.new, prepend this to your instructions:

> **Important constraints for this project:**
> 1. Use `next dev --webpack` and `next build --webpack` in package.json scripts (Turbopack does not work in WebContainers).
> 2. Create an `.npmrc` file with `legacy-peer-deps=true` in the project root.
> 3. Do NOT install `@next/swc-wasm-nodejs` or `@next/swc-wasm-wasm32`.
> 4. Use `next-themes@^0.4.4` (not 0.3.x) if dark mode theming is needed.
> 5. Keep dependencies minimal. Verify React 19 compatibility before adding packages.

---

## Quick Start Checklist

- [ ] Next.js App Router with `src/` directory
- [ ] `npm install @flyo/nitro-next`
- [ ] `.env.local` with `FLYO_ACCESS_TOKEN`, `FLYO_LIVE_EDIT`, `SITE_URL`
- [ ] `src/flyo.config.tsx` — register all block components from OpenAPI schemas
- [ ] `src/proxy.ts` — cache control middleware
- [ ] `src/app/layout.tsx` — wrapped with `<Flyo>`, navigation from config containers
- [ ] `src/app/[[...slug]]/page.tsx` — 4-line re-export
- [ ] `src/app/not-found.tsx`
- [ ] `src/app/sitemap.ts`
- [ ] One React component per `Block*` schema in `src/components/`
- [ ] Entity detail routes for `Entity*` schemas (if needed)
- [ ] `npm run dev` and verify

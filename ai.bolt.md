# AI Instructions: Building a Next.js Website with Flyo Nitro Headless CMS

> **Step-by-step guide for AI assistants to scaffold a Next.js App Router website powered by Flyo Nitro headless CMS using `@flyo/nitro-next`.**

---

> **STOP — READ THESE RULES BEFORE GENERATING ANY CODE:**
>
> 1. This is a **Next.js App Router** project. **Do NOT use Vite, Create React App, or any other framework.** Never create `vite.config.*`, root `index.html`, or Vite scripts.
> 2. **Next.js version MUST be `^16.0.4` or higher.** The `@flyo/nitro-next` package has `peerDependencies: { "next": ">=16.0.4" }`. Using any older version (13, 14, 15) will cause ERESOLVE install failures and broken imports.
> 3. **Always create `.npmrc` with `legacy-peer-deps=true` BEFORE running `npm install`.** Without this, `npm install` will fail with peer dependency conflicts.
> 4. **MUST create `.babelrc` with `{ "presets": ["next/babel"] }`.** SWC does NOT work in this environment. Without `.babelrc`, Next.js will fail to compile.
> 5. **MUST use `--webpack` flag** in the dev script: `"dev": "next dev --webpack"`. Turbopack does not support Babel, so webpack mode is required. Build uses webpack by default.
> 6. **Do NOT use `next/font/google` or `next/font/local`.** These require SWC which does not work. Use `<link>` tags for Google Fonts instead.
> 7. **No ESLint/linting packages** — they introduce peer dependency conflicts.
> 8. **Create ALL config files BEFORE running `npm install`** — `.npmrc`, `tsconfig.json`, `next.config.js`, `package.json` must exist first.
> 9. **Do NOT use `lucide-react`, `@radix-ui/*`, `tailwindcss`, or any UI library** unless the user explicitly requests it. Keep dependencies minimal to avoid install failures.
> 10. **Always use subpath imports.** The valid import paths are: `@flyo/nitro-next/server`, `@flyo/nitro-next/client`, and `@flyo/nitro-next/proxy`. Never use a bare `@flyo/nitro-next` import.

---

## Table of Contents

1. [Environment Constraints](#1-environment-constraints)
2. [Architecture Overview](#2-architecture-overview)
3. [Prerequisites & User-Provided Data](#3-prerequisites--user-provided-data)
4. [Bootstrapping Order](#4-bootstrapping-order)
5. [Required Config Files](#5-required-config-files)
6. [Package.json & Dependencies](#6-packagejson--dependencies)
7. [Environment Variables](#7-environment-variables)
8. [Flyo Configuration File](#8-flyo-configuration-file)
9. [Proxy (Cache Control Middleware)](#9-proxy-cache-control-middleware)
10. [Root Layout with Navigation](#10-root-layout-with-navigation)
11. [Catch-All Page Route](#11-catch-all-page-route)
12. [Building Block Components](#12-building-block-components)
13. [Entity Detail Pages](#13-entity-detail-pages)
14. [Verified Exports Reference](#14-verified-exports-reference)
15. [Prohibited Patterns](#15-prohibited-patterns)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. Environment Constraints

Key constraints for this environment:

- **SWC does NOT work** (neither native binaries nor WASM). The **only** working compiler is Babel via `.babelrc`.
- Turbopack requires SWC, so it cannot work either — **`--webpack` is mandatory** for the dev server.
- npm peer dependency resolution is strict — `.npmrc` with `legacy-peer-deps=true` is mandatory.
- `next/font/*` requires SWC — use `<link>` tags instead.

**Always use `.babelrc` with the `next/babel` preset and run dev with `--webpack`.** This bypasses SWC entirely and uses Babel + webpack.

---

## 2. Architecture Overview

Flyo Nitro is a headless CMS delivering content through a REST API:

- **Config** (`/config`): Navigation containers, available page slugs, global content pools.
- **Pages** (`/pages?slug=...`): Page content by slug. Each page has a `json` array of **blocks** rendered by matching their `component` field to registered React components.
- **Entities** (`/entities/slug/{slug}`): Standalone data objects (blog posts, products, etc.) with their own detail pages.

### How Pages Work

Each block has: `component` (React component name), `content` (data), `config` (options), `items` (mapped entities), `slots` (nested blocks), `uid` (unique ID for live editing).

The library iterates over the page's `json` array and renders the matching React component. **You only need a single catch-all route `[[...slug]]/page.tsx`.**

### Component Mapping

In `flyo.config.tsx`, you register a map of `component` name → React component. The key must **exactly match** the `component` string from the API (case-sensitive).

---

## 3. Prerequisites & User-Provided Data

### A) Flyo Access Token

```
INSERT_YOUR_FLYO_ACCESS_TOKEN_HERE
```

### B) Config API Response

Fetch from: `https://api.flyo.cloud/nitro/v1/config?token=YOUR_TOKEN`

Provides: navigation containers (`containers`), available pages (`pages`), globals (`globals`).

```json
INSERT_YOUR_CONFIG_RESPONSE_HERE
```

### C) OpenAPI Block & Entity Schemas

Fetch from: `https://api.flyo.cloud/nitro/v1/openapi/schemas?token=YOUR_TOKEN`

Returns typed schemas for all block definitions and entity models.

```json
INSERT_YOUR_OPENAPI_SCHEMAS_RESPONSE_HERE
```

Each `Block*` schema (`BlockHeroBanner`, `BlockText`, etc.) tells you:
- `component` enum → the exact key to register in `initNitro({ components })`
- `content` → typed content fields
- `items` → array of typed items (content pool)
- `config` → typed configuration options
- `slots` → named slot containers for nested blocks

Each `Entity*` schema describes entity model fields.

---

## 4. Bootstrapping Order

**Order matters. Create config files BEFORE installing packages.**

1. Create `.npmrc` (mandatory — `legacy-peer-deps=true`)
2. Create `.babelrc` (mandatory — `{ "presets": ["next/babel"] }`)
3. Create `tsconfig.json`
4. Create `next.config.js`
5. Create `package.json` (with correct versions — see section 6)
6. Run `npm install`
7. Create `.env.local`
8. Create all source files (`src/flyo.config.tsx`, `src/proxy.ts`, `src/app/...`, `src/components/...`)
9. Run `npm run dev`

---

## 5. Required Config Files

### A) `.npmrc` — MANDATORY

Create `.npmrc` in the project root **before running `npm install`**:

```
legacy-peer-deps=true
```

**This is NOT optional.** Without it, `npm install` will fail with ERESOLVE errors.

### B) `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### C) `next.config.js`

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

### D) `.babelrc` — MANDATORY

Create `.babelrc` in the project root **before running `npm install`**:

```json
{
  "presets": ["next/babel"]
}
```

**This is NOT optional.** SWC does NOT work in this environment. Without `.babelrc`, Next.js will fail to compile JSX/TSX. The `next/babel` preset is the only working compiler.

**Important:** Because `.babelrc` is active, `next/font/google` and `next/font/local` will NOT work (they require SWC). Use `<link>` tags for fonts instead.

---

## 6. Package.json & Dependencies

```json
{
  "name": "flyo-nextjs",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --webpack",
    "build": "next build",
    "start": "next start"
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

### CRITICAL Version Rules

| Package | Required Version | Why |
|---------|-----------------|-----|
| `next` | `^16.0.4` | `@flyo/nitro-next` peer dep requires `>=16.0.4`. Using 13/14/15 causes ERESOLVE and broken imports. |
| `react` | `^19.2.1` | `@flyo/nitro-next` peer dep requires `^19.2.1`. |
| `react-dom` | `^19.2.1` | Must match React version. |

### What NOT to include

| Do NOT include | Why |
|---------------|-----|
| `eslint`, `eslint-config-next` | Peer dependency conflicts |
| `@next/swc-wasm-nodejs` | SWC does not work — Babel is used instead |
| `tailwindcss`, `postcss`, `autoprefixer` | Only add if user explicitly requests CSS framework |
| `lucide-react`, `@radix-ui/*` | Only add if user explicitly requests icons/UI library |
| Any `lint` script | No ESLint deps installed |

---

## 7. Environment Variables

Create `.env.local`:

```bash
FLYO_ACCESS_TOKEN=INSERT_YOUR_FLYO_ACCESS_TOKEN_HERE
FLYO_LIVE_EDIT=true
SITE_URL=http://localhost:3000
```

---

## 8. Flyo Configuration File

Create `src/flyo.config.tsx`:

```tsx
import type { ReactNode } from 'react';
import { initNitro } from '@flyo/nitro-next/server';
import { FlyoClientWrapper } from '@flyo/nitro-next/client';

// Import ALL block components (one per Block* schema from OpenAPI)
import { HeroBanner } from './components/HeroBanner';
import { Text } from './components/Text';

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
  // Keys MUST match the "component" enum from each Block* schema EXACTLY (case-sensitive)
  components: {
    HeroBanner: HeroBanner,
    Text: Text,
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

**Important:** This file does NOT have `'use client'`. It is a server module. `FlyoClientWrapper` is a client component that gets rendered from here — this is valid in Next.js App Router.

---

## 9. Proxy (Cache Control Middleware)

Create `src/proxy.ts`:

```ts
import { createProxy } from '@flyo/nitro-next/proxy';
import { flyoConfig } from './flyo.config';

export default createProxy(flyoConfig());

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

This is the Next.js proxy (formerly called "middleware" in Next.js ≤15). **In Next.js 16+ the file MUST be named `proxy.ts`** — Next.js only recognizes this exact filename. Place it at `src/proxy.ts` (if using `src/` directory) or `proxy.ts` (at project root). Sets `Cache-Control` headers based on TTL config. Disables caching when `liveEdit` is `true`.

---

## 10. Root Layout with Navigation

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
        <head>
          {/* Use <link> for Google Fonts — next/font requires SWC which is not available */}
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link
            href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
            rel="stylesheet"
          />
        </head>
        <body style={{ fontFamily: "'Inter', sans-serif", margin: 0 }}>
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

**Rules:**
- Do NOT import `next/font/google` or `next/font/local` — use `<link>` tags instead.
- Root layout MUST wrap content with `<Flyo>`.
- Access other containers by identifier: `config?.containers?.footer`.
- For nested navigation, check `item.children` array.

---

## 11. Catch-All Page Route

Create `src/app/[[...slug]]/page.tsx`:

```tsx
export {
  nitroPageRoute as default,
  nitroPageGenerateMetadata as generateMetadata,
} from '@flyo/nitro-next/server';
```

**That's it.** This single file handles: homepage (`/`), all CMS pages, 404s, and SEO metadata.

> **Production SSG (optional):** Add `nitroPageGenerateStaticParams as generateStaticParams` for static generation. WARNING: This disables live preview. Only enable for production builds.

---

## 12. Building Block Components

For each `Block*` schema in the OpenAPI response, create a React component.

### Rules for ALL Block Components

1. **MUST have `'use client'` as the very first line** — `editable()` is a client-only function
2. **MUST spread `{...editable(block)}` on the root element** — required for live editing
3. **MUST import from the correct paths:**
   - `Block` type → `@flyo/nitro-typescript`
   - `editable` → `@flyo/nitro-next/client`
   - `FlyoWysiwyg` → `@flyo/nitro-next/client`
   - `FlyoCdnLoader` → `@flyo/nitro-next/client`

**Exception:** Components using `NitroSlot` must be **server components** — no `'use client'`, no `editable()`.

### Example: HeroBanner (content fields)

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

### Example: Text/WYSIWYG (rich text)

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

**Custom WYSIWYG image nodes:** In WYSIWYG content, image nodes have `node.attrs.src` as an object `{ source, caption, copyright }` — NOT a plain string URL. Always use `node.attrs.src.source` for the URL.

```tsx
'use client';

export default function CustomImage({ node }: { node: { attrs: { src: { source: string; caption?: string }; alt?: string; title?: string } } }) {
  return (
    <img
      src={node.attrs.src.source}
      alt={node.attrs.alt}
      title={node.attrs.title}
      style={{ maxWidth: '100%', height: 'auto', margin: '1rem 0' }}
    />
  );
}
```

Use it with: `<FlyoWysiwyg json={block.content.content.json} components={{ image: CustomImage }} />`

### Example: Items-Based Block (content pool)

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

### Example: Slot Container (nested blocks — SERVER component)

```tsx
// NO 'use client' — this MUST be a server component
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

`NitroSlot` is server-only. Never use it in a `'use client'` component.

### Image Optimization with FlyoCdnLoader

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

## 13. Entity Detail Pages

Create a dynamic route, e.g., `src/app/tiere/[slug]/page.tsx`:

```tsx
import {
  nitroEntityRoute,
  nitroEntityGenerateMetadata,
  getNitroEntities,
  type EntityResolver
} from '@flyo/nitro-next/server';
import { FlyoMetric } from '@flyo/nitro-next/client';
import type { Entity } from '@flyo/nitro-typescript';

type RouteParams = {
  params: Promise<{ slug: string }>;
};

const resolver: EntityResolver<{ slug: string }> = async (params) => {
  const { slug } = await params;
  return getNitroEntities().entityBySlug({ slug, typeId: 123 }); // ← Use actual typeId from CMS
};

export const generateMetadata = (props: RouteParams) =>
  nitroEntityGenerateMetadata(props, { resolver });

export default function Page(props: RouteParams) {
  return nitroEntityRoute(props, {
    resolver,
    render: (entity: Entity) => (
      <div>
        <FlyoMetric entity={entity} />
        <h1>{entity.entity?.entity_title}</h1>
        <p>{entity.entity?.entity_teaser}</p>
      </div>
    ),
  });
}
```

---

## 14. Verified Exports Reference

These are the **exact exports** available. Do NOT import anything not listed here.

### `@flyo/nitro-next/server`

```ts
// Components
NitroBlock         // Server component: renders a single block
NitroPage          // Server component: renders all blocks on a page
NitroSlot          // Server component: renders nested blocks from a slot
NitroDebugInfo     // Server component: outputs debug HTML comment

// Initialization
initNitro           // Initialize Flyo configuration, returns () => NitroState
getNitro            // Access current Nitro state (throws if not initialized)
getNitroConfig      // Fetch/cache config response (navigation, pages, globals)
getNitroPages       // Pages API instance
getNitroEntities    // Entities API instance
getNitroSitemap     // Sitemap API instance
getNitroSearch      // Search API instance

// Route helpers — Pages
nitroPageRoute              // Default page route handler for [[...slug]]/page.tsx
nitroPageGenerateMetadata   // Generate SEO metadata for pages
nitroPageGenerateStaticParams // Generate static params for SSG (production only)

// Route helpers — Entities
nitroEntityRoute            // Entity detail page handler
nitroEntityGenerateMetadata // Generate metadata for entity pages

// Sitemap
nitroSitemap                // Generate sitemap from CMS content

// Types
type EntityResolver
type NitroState

// Also re-exported for convenience (importable from server OR client):
FlyoCdnLoader              // Image loader — also available via @flyo/nitro-next/client
```

### `@flyo/nitro-next/client`

```ts
editable(block: Block)     // Returns { 'data-flyo-uid': string } for live editing. MUST spread on root element.
FlyoClientWrapper          // Wrapper component for live editing mode
FlyoWysiwyg               // Renders TipTap JSON content. Props: { json, components? }
FlyoCdnLoader              // Image loader for Next.js Image with Flyo CDN
FlyoMetric                 // Tracking component for entity metrics (production only)
isProd                     // Boolean: true if NODE_ENV === 'production'
```

### `@flyo/nitro-next/proxy`

```ts
createProxy(state: NitroState) // Create Next.js middleware for cache control
```

### `@flyo/nitro-typescript`

```ts
Block              // TypeScript type for a page block
Entity             // TypeScript type for an entity
Page               // TypeScript type for a page
ConfigResponse     // TypeScript type for config API response
ContainerPage      // TypeScript type for a navigation container page item
```

---

## 15. Prohibited Patterns

### NEVER Do These

1. **NEVER use `next@13`, `next@14`, or `next@15`.** The library requires `next@>=16.0.4`. Wrong version = broken installs AND broken imports (`editable`, `FlyoClientWrapper`, `FlyoCdnLoader` will show as "not exported").

2. **ALWAYS create `.babelrc`** with `{ "presets": ["next/babel"] }`. SWC does not work — Babel is the only working compiler.

3. **ALWAYS use `--webpack` flag** in the dev script: `"dev": "next dev --webpack"`. Turbopack requires SWC which is not available.

4. **NEVER use `next/font/google` or `next/font/local`.** Use `<link>` tags for fonts.

5. **NEVER use Vite.** No `vite.config.ts`, no root `index.html`, no Vite scripts.

6. **NEVER install `@next/swc-wasm-nodejs` manually.** SWC does not work. Babel is used instead.

7. **NEVER install ESLint in the base template.** It causes peer dependency conflicts.

8. **Always use explicit subpath imports** — `@flyo/nitro-next/server`, `@flyo/nitro-next/client`, `@flyo/nitro-next/proxy`. Never use a bare `@flyo/nitro-next` import.

9. **NEVER use `editable()` without `'use client'`** at the top of the file. It is a client-only function.

10. **NEVER use `NitroSlot` in a client component.** It is server-only.

### Folder Structure

```
.npmrc                       # ← MANDATORY: legacy-peer-deps=true
.babelrc                     # ← MANDATORY: { "presets": ["next/babel"] } — SWC is not available
.env.local                   # ← API token and config
next.config.js               # ← Image remote patterns
tsconfig.json
package.json
src/
├── flyo.config.tsx          # Flyo configuration & component registry
├── proxy.ts                 # Cache control proxy (MUST be named proxy.ts in Next.js 16+)
├── app/
│   ├── layout.tsx           # Root layout with <Flyo> wrapper
│   ├── not-found.tsx        # 404 page (simple: export default function NotFoundPage() { return <h1>Page not found</h1>; })
│   ├── sitemap.ts           # Sitemap (import { nitroSitemap } from server, import { flyoConfig } from config)
│   └── [[...slug]]/
│       └── page.tsx         # ← THE ONLY PAGE ROUTE NEEDED (2-line re-export)
└── components/
    ├── HeroBanner.tsx       # One 'use client' component per Block* schema
    ├── Text.tsx
    └── ...
```

---

## 16. Troubleshooting

### Error → Cause → Fix Table

| Error/Symptom | Root Cause | Fix |
|--------------|-----------|-----|
| `ERESOLVE could not resolve` / `peer next@">=16.0.4"` | Next.js version too old (`13.x`, `14.x`, `15.x`) | Change `next` in `package.json` to `"^16.0.4"`, delete `node_modules` and `package-lock.json`, run `npm install` |
| `Module not found: Can't resolve '@flyo/nitro-next/client'` | Wrong Next.js version installed OR `@flyo/nitro-next` not properly installed | Fix Next.js to `^16.0.4`, ensure `.npmrc` has `legacy-peer-deps=true`, reinstall |
| `'editable' is not exported from '@flyo/nitro-next/client'` | Same as above — version mismatch caused broken install | Same fix as above |
| `'FlyoClientWrapper' is not exported from '@flyo/nitro-next/client'` | Same as above | Same fix as above |
| `'FlyoCdnLoader' is not exported from '@flyo/nitro-next/client'` | Same as above | Same fix as above |
| `Invariant: Expected workUnitAsyncStorage to have a store` | Next.js version mismatch OR WASM async context issue | Ensure `next@^16.0.4`. Delete `.next` cache: `rm -rf .next`. Restart dev server. |
| Hundreds of `webpack.cache.PackFileCacheStrategy` warnings | Missing or incorrect `.babelrc`, or wrong Next.js version | Ensure `.babelrc` has `{ "presets": ["next/babel"] }` and `next@^16.0.4` is installed. Delete `.next` and `node_modules`, reinstall. |
| `turbo.createProject is not supported by the wasm bindings` | Turbopack cannot run — SWC is not available | Use `--webpack` flag: `"dev": "next dev --webpack"`. Turbopack requires SWC which is not available. |
| `npm install` fails even with correct versions | Missing `.npmrc` | Create `.npmrc` with `legacy-peer-deps=true` before installing |
| Build runs `npx vite build` instead of `next build` | Project misidentified as Vite | Ensure no `vite.config.*` or root `index.html` exists |
| `next/font` build errors | `next/font` requires SWC which is not available | Remove all `next/font` imports, use `<link>` tags instead. |
| `ERR_INVALID_ARG_TYPE: "code" must be number, received SIGINT` | Signal handling quirk — harmless on exit | Ignore. This only happens on Ctrl+C and does not affect functionality. |

### Complete Reset

```bash
rm -rf node_modules .next package-lock.json
echo "legacy-peer-deps=true" > .npmrc
echo '{"presets":["next/babel"]}' > .babelrc
npm install
npm run dev
```

### Verification Checklist

After scaffolding, verify:

- [ ] `package.json` has `"next": "^16.0.4"` (NOT 13, 14, or 15)
- [ ] `package.json` has `"react": "^19.2.1"` and `"react-dom": "^19.2.1"`
- [ ] `package.json` dev script is `"dev": "next dev --webpack"` (webpack required — Turbopack needs SWC which is not available)
- [ ] `package.json` build script is `"build": "next build"` (webpack is default for build)
- [ ] `.npmrc` exists with `legacy-peer-deps=true`
- [ ] `.babelrc` exists with `{ "presets": ["next/babel"] }`
- [ ] No `vite.config.*` files exist
- [ ] No root `index.html` exists
- [ ] `grep -r "next/font" src/` returns nothing
- [ ] All `@flyo/nitro-next` imports use explicit subpaths (`/server`, `/client`, `/proxy`) — never bare `@flyo/nitro-next`
- [ ] Proxy file is named `src/proxy.ts` (NOT `middleware.ts` — Next.js 16 renamed middleware to proxy)
- [ ] All block components have `'use client'` and use `editable(block)`
- [ ] Slot components do NOT have `'use client'`
- [ ] `npm install` succeeds
- [ ] `npm run dev` starts without import errors

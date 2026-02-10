# AI Instructions: Building a Next.js Website with Flyo Nitro Headless CMS — Bolt.new / StackBlitz Edition

> **Step-by-step guide for AI assistants to scaffold a Next.js App Router website powered by Flyo Nitro headless CMS using `@flyo/nitro-next` — optimized for Bolt.new and StackBlitz WebContainer environments.**

---

> **⚠️ CRITICAL CONSTRAINTS — READ ENTIRELY BEFORE GENERATING ANY CODE:**
>
> 1. This is a **Next.js App Router** project. **Do NOT use Vite, Create React App, or any other framework.** Do NOT start from a Vite template. Do NOT create `vite.config.*`, root `index.html`, or Vite scripts.
> 2. Bolt.new / StackBlitz use **WebContainers** (WASM-based Node.js in the browser). Native SWC binaries cannot load, so Next.js falls back to WASM SWC bindings. **You MUST apply these four mitigations to make Next.js work in this environment:** (a) create a `.babelrc` with `{"presets":["next/babel"]}` to force Babel transforms instead of SWC, (b) use `--webpack` flag in all `dev` and `build` scripts to avoid Turbopack, (c) never use `next/font/*` (use `<link>` tags for Google Fonts instead), and (d) never install `@next/swc-wasm-nodejs` or `@next/swc-wasm-wasm32` manually.
> 3. **Webpack mode is mandatory** — add `--webpack` to both `dev` and `build` scripts. Turbopack crashes in WASM environments.
> 4. **Babel transforms are mandatory** — create `.babelrc` with `{"presets":["next/babel"]}` **before running `npm install`**. This forces JavaScript-based Babel transforms and avoids SWC transform code paths that fail in WebContainers.
> 5. **`next/font/*` is prohibited** — `next/font/google` and `next/font/local` rely on SWC and will break builds when Babel is enabled. Use `<link>` tags for Google Fonts instead.
> 6. **No ESLint/linting packages in the base template** — they introduce peer dependency conflicts that cause `npm install` failures.
> 7. **Minimal dependencies only** — avoid UI libraries with React 18-only peer ranges. Add them later once the project is stable.
> 8. Create **all config files before running `npm install`** — `.babelrc`, `tsconfig.json`, `next.config.js` must exist first to reduce failure modes.

---

## Table of Contents

1. [WebContainer Environment & Root Cause](#1-webcontainer-environment--root-cause)
2. [Architecture Overview](#2-architecture-overview)
3. [Prerequisites & User-Provided Data](#3-prerequisites--user-provided-data)
4. [Bootstrapping Order](#4-bootstrapping-order)
5. [Required Config Files (Create BEFORE Install)](#5-required-config-files-create-before-install)
6. [Package.json & Dependencies](#6-packagejson--dependencies)
7. [Environment Variables](#7-environment-variables)
8. [Flyo Configuration File](#8-flyo-configuration-file)
9. [Middleware Proxy](#9-middleware-proxy)
10. [Root Layout with Navigation](#10-root-layout-with-navigation)
11. [Catch-All Page Route](#11-catch-all-page-route)
12. [Building Block Components](#12-building-block-components)
13. [Entity Detail Pages](#13-entity-detail-pages)
14. [Not Found Page](#14-not-found-page)
15. [Sitemap Generation](#15-sitemap-generation)
16. [Image Optimization](#16-image-optimization)
17. [API Reference Summary](#17-api-reference-summary)
18. [Prohibited Patterns](#18-prohibited-patterns)
19. [Common Mistakes to Avoid](#19-common-mistakes-to-avoid)
20. [Troubleshooting](#20-troubleshooting)
21. [Validation Checklist](#21-validation-checklist)

---

## 1. WebContainer Environment & Root Cause

### Why Bolt/StackBlitz Requires Special Handling

Bolt.new and StackBlitz run Node.js in the browser using **WebContainers** — a WASM-based runtime. In this environment:

- **Native SWC binaries cannot load.** Next.js automatically falls back to WASM bindings (`@next/swc-wasm-nodejs`).
- **The WASM SWC fallback is the root cause of most issues.** It can cause crashes in SWC transform code paths and Turbopack.

**What you MUST do about it:** Force Babel transforms (`.babelrc`), force Webpack mode (`--webpack`), and avoid `next/font/*`. These mitigations bypass the broken SWC/Turbopack code paths. See the [Mitigation Strategy](#mitigation-strategy) below for the full list.

### How to Verify You're in WASM Fallback Mode

Check your dev server output for these lines:

```
Downloading swc package @next/swc-wasm-nodejs...
```
```
we're using WASM bindings
```

If you see these, the WASM fallback is active. This is expected in WebContainers and cannot be avoided — the mitigations in this document work around it.

### Symptoms of WASM-Related Failures

| Symptom | Cause |
|---------|-------|
| `turbo.createProject is not supported by the wasm bindings` | Turbopack cannot run in WASM mode |
| `Invariant: Cannot access "entryCSSFiles" without a work store` | WASM SWC async context issue — apply Babel + Webpack mitigations |
| `Expected workUnitAsyncStorage to have a store` | Same root cause — apply Babel + Webpack mitigations |
| Preview returns 500 on `/` with invariant errors | Server component rendering fails under WASM |
| `npm install` fails with ERESOLVE | Peer dependency conflicts (React 19, strict resolution) |
| Build errors referencing font loader or SWC | `next/font/*` requires SWC, conflict with Babel |
| Publish runs `npx vite build` instead of `next build` | Bolt misidentified the project as Vite |

### Mitigation Strategy

The following mitigations reduce reliance on SWC and avoid known crash paths:

1. **Force Webpack mode** (`--webpack` in `dev` and `build` scripts) — avoids Turbopack WASM crash
2. **Force Babel transforms** (create `.babelrc` with `{"presets":["next/babel"]}`) — bypasses SWC transform code paths
3. **Prohibit `next/font/*`** — avoids SWC-dependent font loader that conflicts with Babel
4. **Minimize dependencies** — reduces peer conflict surface and avoids React 18-only peer ranges

> **Important**: Even with all mitigations, some edge-case invariants may persist due to fundamental WebContainer limitations around async context and server components. If issues persist after applying all mitigations, the same repo will likely work in a standard glibc environment (local dev, Docker, Vercel). Use Bolt primarily for scaffolding and deployment; consider local dev for debugging.

---

## 2. Architecture Overview

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

## 3. Prerequisites & User-Provided Data

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

## 4. Bootstrapping Order

**The order matters.** Create config files before installing packages to reduce failure modes.

### Step-by-Step Order

1. **Create `.babelrc`** (mandatory — forces Babel, avoids SWC transform crashes)
2. **Create `tsconfig.json`**
3. **Create `next.config.js`**
4. **Create `package.json`** (with minimal deps, no lint deps)
5. **Create `.npmrc`** (if peer conflicts appear — try without first)
6. **Run `npm install`**
7. **Create `.env.local`**
8. **Create all source files** (`src/flyo.config.tsx`, `src/proxy.ts`, `src/app/...`, `src/components/...`)
9. **Run `npm run dev`** and verify

> **Why this order?** npm peer resolution is strict in WebContainers and SWC fallback can happen immediately during install. Pre-creating config files (especially `.babelrc`) ensures the build system is configured before any compilation occurs.

---

## 5. Required Config Files (Create BEFORE Install)

### A) `.babelrc` — MANDATORY for Bolt

Create `.babelrc` in the project root **before running `npm install`**:

```json
{
  "presets": ["next/babel"]
}
```

**Why this is mandatory:**
- `.babelrc` disables SWC transforms and uses JavaScript-based Babel transforms instead.
- This reduces reliance on the WASM SWC bindings that cause crashes in WebContainers.
- Next.js may still download SWC WASM for other internal features, but the main transform path uses Babel.
- Build and dev will be slower (expected trade-off for stability).

**Verification:** Fewer SWC-dependent transform errors. Dev server starts without SWC transform crashes.

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

### D) `.npmrc` — Create If Peer Conflicts Occur

If `npm install` fails with ERESOLVE errors, create `.npmrc` in the project root:

```
legacy-peer-deps=true
```

**When this is needed:**
- Any third-party package has React 18-only peer ranges
- Peer dependency resolution conflicts between packages

> **Tip:** Try `npm install` without `.npmrc` first. If it fails, create `.npmrc` and retry.

---

## 6. Package.json & Dependencies

### Bolt Minimal Template

```json
{
  "name": "flyo-nextjs",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --webpack",
    "build": "next build --webpack",
    "start": "next start",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@flyo/nitro-next": "^1.8.0",
    "next": "^15.5.12",
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

### Key Decisions Explained

| Decision | Reason |
|----------|--------|
| `next` uses `^15.5.12` or later | Compatible with `@flyo/nitro-next`. The Babel + Webpack mitigations handle WASM SWC issues across versions. |
| `--webpack` in `dev` and `build` | Turbopack crashes in WASM environments (`turbo.createProject not supported`). |
| No `lint` script or ESLint deps | ESLint and `eslint-config-next` introduce peer dependency conflicts (ESLint major versions, TypeScript-ESLint plugin ranges) causing ERESOLVE. Linting can be added later for local dev/CI. |
| No `@next/swc-wasm-nodejs` or `@next/swc-wasm-wasm32` | Next.js downloads the correct WASM bindings automatically. Do NOT manually install them. |
| Minimal deps only | UI libraries with React 18-only peers (`vaul`, `recharts`, older `@radix-ui/*`, etc.) cause install failures. Add after the baseline is stable. |

### Verification

After `npm install`:
- Install completes without `--force` or manual version gymnastics
- `npm run dev` starts and shows `Next.js ... (webpack)` in output
- Dev output may show SWC WASM download — this is expected

### Third-Party Package Compatibility

If you need additional packages, ensure React 19 compatibility:

| Package | Problematic Version | Fix |
|---------|-------------------|-----|
| `next-themes` | `0.3.x` (peer: React 16–18) | Use `next-themes@^0.4.4` |
| `lucide-react` | `0.344.x` (peer: React 16–18) | Use `lucide-react@^0.460.0` |
| `react-day-picker` | `8.x` (peer: React 16–18) | Use `react-day-picker@^9.0.0` |
| `@radix-ui/*` | Old versions | Use latest versions (most now support React 19) |

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

## 9. Middleware Proxy

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

## 10. Root Layout with Navigation

Create `src/app/layout.tsx`:

> **BOLT RULE: Do NOT use `next/font/google` or `next/font/local`.** These require SWC and will break builds when Babel is enabled. Use `<link>` tags for fonts instead.

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
          {/* Use <link> for Google Fonts — next/font is prohibited */}
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

## 11. Catch-All Page Route

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

## 12. Building Block Components

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

## 13. Entity Detail Pages

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

## 14. Not Found Page

Create `src/app/not-found.tsx`:

```tsx
export default function NotFoundPage() {
  return <h1>Page not found</h1>;
}
```

---

## 15. Sitemap Generation

Create `src/app/sitemap.ts`:

```ts
import { nitroSitemap } from '@flyo/nitro-next/server';
import { flyoConfig } from '../flyo.config';

export default async function sitemap() {
  return nitroSitemap(flyoConfig());
}
```

---

## 16. Image Optimization

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

## 17. API Reference Summary

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

## 18. Prohibited Patterns

### NEVER Do These

1. **Do NOT use `next/font/google` or `next/font/local`.**
   - `next/font` relies on SWC transforms. With Babel enabled (`.babelrc`), `next/font` will break builds.
   - **Verification:** `grep -R "next/font" -n` must return nothing.
   - **Instead:** Use `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=...">` in the `<head>` and style with `fontFamily`.

2. **Do NOT use Turbopack.**
   - Turbopack crashes in WASM environments.
   - Always use `--webpack` flag in `dev` and `build` scripts.
   - **Verification:** Dev output shows `Next.js ... (webpack)`.

3. **Do NOT install ESLint or linting packages in the base template.**
   - `eslint`, `eslint-config-next`, and related packages introduce peer dependency conflicts.
   - Remove `lint` script or leave it but do not install lint deps.
   - Linting can be added as an optional step later for local dev or CI.

4. **Do NOT install `@next/swc-wasm-nodejs` or `@next/swc-wasm-wasm32` manually.**
   - Next.js downloads the correct WASM bindings automatically.

5. **Do NOT create Vite files.**
   - No `vite.config.ts`, `vite.config.js`, or root `index.html`.
   - No Vite scripts in `package.json`.
   - If Bolt's publish pipeline runs `npx vite build`, check the Bolt template/config detection — it may have misidentified the project.
   - **Verification:** No Vite files exist; publish uses `next build --webpack`.

6. **Do NOT install non-essential UI libraries upfront.**
   - Packages like `vaul`, `recharts`, older `react-day-picker`, etc. have React 18-only peer ranges.
   - Get the baseline working first; add libraries one at a time.

### Folder Structure

```
.babelrc                     # ← MANDATORY for Bolt
.npmrc                       # ← Only if peer conflicts appear
.env.local                   # ← API token and config
next.config.js               # ← Image remote patterns
tsconfig.json
package.json
src/
├── flyo.config.tsx          # Flyo configuration & component registry
├── proxy.ts                 # Cache control middleware
├── app/
│   ├── layout.tsx           # Root layout — NO next/font imports
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

## 19. Common Mistakes to Avoid

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
13. **Using `next/font/*`**: Breaks builds when Babel is enabled. Use `<link>` tags instead.
14. **Using Turbopack**: Always use `--webpack`. Turbopack crashes in WASM environments.
15. **Including ESLint deps**: Causes peer conflicts. Omit from base template.


---

## 20. Troubleshooting

### `npm install` fails with ERESOLVE peer dependency errors

```bash
echo "legacy-peer-deps=true" > .npmrc
rm -rf node_modules package-lock.json
npm install
```

### Turbopack crashes (`turbo.createProject is not supported`)

Ensure `package.json` scripts include `--webpack`:
```json
"dev": "next dev --webpack",
"build": "next build --webpack"
```

### Invariant errors (`entryCSSFiles`, `workUnitAsyncStorage`, etc.)

These are caused by WASM SWC async context issues. Ensure all mitigations are applied:

1. `.babelrc` exists with `{"presets": ["next/babel"]}`
2. Scripts use `--webpack` (not Turbopack)
3. No `next/font/*` imports in code
4. Run `rm -rf .next && npm run dev` to clear cache

### Build errors referencing font loader or SWC

You're using `next/font/*` with Babel enabled. Remove all `next/font` imports:

```bash
grep -R "next/font" -n
```

Replace with `<link>` tags in `layout.tsx` `<head>`.

### Preview returns 500 but deploy works

This is a known WebContainer limitation. The WASM SWC bindings cannot properly maintain async context for server components. Mitigations:

1. Ensure `.babelrc` exists with `{"presets": ["next/babel"]}`
2. Ensure scripts use `--webpack` flag
3. Ensure no `next/font/*` imports exist
4. Run `rm -rf .next && npm run dev` to clear cache
5. If issues persist, this is an environment limitation — the same repo will work in a standard glibc environment (local dev, Docker, Vercel)

### Bolt publish runs `npx vite build` instead of `next build`

Bolt misidentified the project as Vite. Check:
- No `vite.config.ts` or `vite.config.js` exists
- No root `index.html` exists
- No Vite-related scripts in `package.json`
- Check Bolt's template config files (often `config.json`) if the publish pipeline persists

### Complete reset

```bash
echo "legacy-peer-deps=true" > .npmrc
rm -rf node_modules .next package-lock.json
npm install --legacy-peer-deps
npm run dev
```

If Bolt created a Vite project instead of Next.js, you must start over — Vite and Next.js are entirely different frameworks.

### When to Give Up on Bolt Preview

If invariant errors persist after applying **all** mitigations (Babel, Webpack, `--webpack` flag, no `next/font`):

- **This is an environment limitation**, not a code problem.
- **Verify:** Run the exact same repo locally in a glibc environment (Linux, macOS, or Docker) — it should work.
- **Recommended:** Use Bolt for scaffolding and deployment. Use local dev for debugging and preview.

---

## 21. Validation Checklist

After scaffolding a project, verify each item:

### Config & Files

- [ ] `.babelrc` exists with `{"presets": ["next/babel"]}`
- [ ] `next.config.js` has `images.remotePatterns` for `**.flyo.cloud`
- [ ] `tsconfig.json` exists with `paths: { "@/*": ["./src/*"] }`
- [ ] No `vite.config.*` files exist
- [ ] No root `index.html` exists

### Dependencies

- [ ] `next` version is `^15.5.12` or later in `package.json`
- [ ] No `eslint` or `eslint-config-next` in dependencies
- [ ] No `@next/swc-wasm-nodejs` or `@next/swc-wasm-wasm32` in dependencies
- [ ] `npm install` succeeds without `--force`

### Scripts

- [ ] `dev` script is `next dev --webpack`
- [ ] `build` script is `next build --webpack`
- [ ] No Vite-related scripts

### Code

- [ ] `grep -R "next/font" -n` returns nothing
- [ ] `src/flyo.config.tsx` exists with component registry
- [ ] `src/proxy.ts` exists (middleware)
- [ ] `src/app/layout.tsx` uses `<Flyo>` wrapper and `<link>` tags for fonts (not `next/font`)
- [ ] `src/app/[[...slug]]/page.tsx` exists (catch-all route)
- [ ] `src/app/not-found.tsx` exists
- [ ] All block components have `'use client'` and use `editable(block)`
- [ ] Slot components do NOT have `'use client'`

### Runtime

- [ ] `npm run dev` starts successfully
- [ ] Dev output shows `Next.js ... (webpack)` (not Turbopack)
- [ ] Homepage renders at least a basic Flyo page route
- [ ] Publish uses `next build --webpack`, not `vite build`

### If Invariants Persist

- [ ] Confirm it is environment-specific: run the same repo locally in a glibc environment
- [ ] Use Bolt for scaffolding/deployment, local dev for preview/debugging

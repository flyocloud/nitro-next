# AI Instructions: Building a Next.js Website with Flyo Nitro Headless CMS

> **This document is a step-by-step guide for AI assistants (LLMs) to scaffold and build a complete Next.js App Router website powered by the Flyo Nitro headless CMS using the `@flyo/nitro-next` adapter.**

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
10. [Not Found Page](#10-not-found-page)
11. [Sitemap Generation](#11-sitemap-generation)
12. [Image Optimization](#12-image-optimization)
13. [Nested Blocks (Slots)](#13-nested-blocks-slots)
14. [API Reference Summary](#14-api-reference-summary)
15. [Common Mistakes to Avoid](#15-common-mistakes-to-avoid)

---

## 1. Architecture Overview

Flyo Nitro is a headless CMS that delivers website content through a REST API. The architecture has three pillars:

- **Config** (`/config`): Global site data — navigation containers, available page slugs, global content pools. Fetched once and cached.
- **Pages** (`/pages?slug=...`): Page content by slug. Each page has an array of **blocks** (components) in its `json` field. Blocks are rendered by matching their `component` field to registered React components.
- **Entities** (`/entities/slug/{slug}` or `/entities/uniqueid/{uniqueid}`): Standalone data objects (blog posts, products, animals, etc.) with their own detail pages.

### How Pages Work

The CMS returns a page object with a `json` array. Each entry is a **block** with:
- `component`: The React component name (e.g., `"HeroBanner"`, `"Text"`, `"CardsGrid"`)
- `content`: The content data for the component
- `config`: Configuration/styling options
- `items`: Mapped entity data (arrays of content pool items)
- `slots`: Nested child blocks (for container components)
- `identifier`: The block type identifier in the CMS
- `uid`: Unique block ID (used for live editing)

The `@flyo/nitro-next` library automatically iterates over the `json` array and renders the matching React component for each block. **You only need to create a single catch-all route `[[...slug]]/page.tsx`** — the library handles all page routing.

### Key Concept: Component Mapping

In your `flyo.config.tsx`, you register a map of `component` name → React component. The library looks up each block's `component` value in this map and renders it. If a block's `component` is `"HeroBanner"`, the library renders the React component you registered under the key `"HeroBanner"`.

---

## 2. Prerequisites & User-Provided Data

To build the website, you need two pieces of project-specific data from the user. These vary per project and **must be provided by the user**.

### A) Flyo Access Token

The API token for authenticating with the Flyo Nitro API.

```
INSERT_YOUR_FLYO_ACCESS_TOKEN_HERE
```

### B) Config API Response

Fetch the config from: `https://api.flyo.cloud/nitro/v1/config?token=YOUR_TOKEN`

This tells you:
- What **navigation containers** exist (e.g., `nav`, `footer`) and their items
- What **page slugs** are available
- What **global data** is available (e.g., locations for a footer)

```json
INSERT_YOUR_CONFIG_RESPONSE_HERE
```

### C) Homepage API Response (Contains All Block Types)

Fetch the homepage from: `https://api.flyo.cloud/nitro/v1/pages/home?token=YOUR_TOKEN`

> **IMPORTANT**: Ask the user to ensure ALL block types used across the site are placed on the homepage. This way you can see every block's `component` name, `content` structure, `config` structure, and `items` structure in one response.

This response contains the `json` array with all blocks. Each block shows you exactly what data structure your React components will receive.

```json
INSERT_YOUR_HOMEPAGE_RESPONSE_HERE
```

### How to Read the Provided Data

From the **Config Response**, extract:
1. **Navigation containers**: Look at the `containers` object. Each key (e.g., `"nav"`, `"footer"`) is a container identifier. Each container has `items` — an array of page links with `label`, `href`, `slug`, `children`, and `properties`.
2. **Available pages**: The `pages` array lists all valid slugs (e.g., `["", "news", "about"]`). An empty string `""` is the homepage.
3. **Globals**: The `globals` object contains content pool data available on every page (e.g., footer locations, social links).

From the **Homepage Response**, extract:
1. **Block components**: Look at each entry in the `json` array. The `component` field tells you the React component name to create. The `identifier` field is the CMS-internal block type name.
2. **Content structure**: The `content` object shows what fields each component receives (e.g., `title`, `teaser`, `image.source`, `content.json`).
3. **Items structure**: The `items` array shows mapped entity data (e.g., cards with `title`, `teaser`, `image`, `link`).
4. **Config structure**: The `config` object shows styling/configuration options (e.g., `is_dark`, `background_color`).
5. **Slots structure**: The `slots` object shows nested blocks. Each slot has an `identifier` and a `content` array of child blocks.

---

## Example: Reading the Zoo Playground Data

Here is an example using the Zoo playground project to demonstrate how to interpret the data:

**Example Config Response:**
```json
{
  "nitro": {
    "domain": "flyo.zoo",
    "slug": "flyo-zoo",
    "version": 111,
    "updated_at": 1768825437,
    "primary_language": "de",
    "language": "de"
  },
  "pages": ["", "news", "tiere-in-unserem-zoo", "events-im-zoo", "essen-and-trinken"],
  "containers": {
    "nav": {
      "uid": "422ecb46-219a-4ebb-81f4-27c811982d14",
      "identifier": "nav",
      "label": "Navigation",
      "items": [
        {"type": "page", "target": "_self", "label": "Startseite", "href": "/", "slug": "", "properties": {}, "children": []},
        {"type": "page", "target": "_self", "label": "News aus dem Zoo", "href": "/news", "slug": "news", "properties": {}, "children": []},
        {"type": "page", "target": "_self", "label": "Tiere im Zoo", "href": "/tiere-in-unserem-zoo", "slug": "tiere-in-unserem-zoo", "properties": {}, "children": []},
        {"type": "page", "target": "_self", "label": "Events im Zoo", "href": "/events-im-zoo", "slug": "events-im-zoo", "properties": {}, "children": []},
        {"type": "page", "target": "_self", "label": "Essen & Trinken", "href": "/essen-and-trinken", "slug": "essen-and-trinken", "properties": {}, "children": []}
      ]
    }
  },
  "globals": {}
}
```

**What we learn from this config:**
- There is **one navigation container** called `"nav"` with 5 items. No footer container exists.
- The navigation is **flat** (no `children` — all items are top-level).
- The language is `"de"` (German).
- There are 5 pages: homepage (`""`), news, tiere-in-unserem-zoo, events-im-zoo, essen-and-trinken.

**Example Homepage Response (abbreviated for clarity):**
```json
{
  "title": "Startseite",
  "slug": "",
  "json": [
    {
      "component": "HeroBanner",
      "identifier": "hero_banner",
      "content": {
        "image": {"source": "https://storage.flyo.cloud/...", "caption": null, "copyright": null},
        "title": "Willkommen im Flyo Zoo!",
        "teaser": "365 TAGE IM JAHR GEÖFFNET"
      },
      "config": {},
      "items": [],
      "slots": {}
    },
    {
      "component": "Text",
      "identifier": "text_element",
      "content": {
        "content": {
          "html": "<h2>Öffnungszeiten</h2>...",
          "json": {"type": "doc", "content": [...]}
        }
      },
      "config": {},
      "items": [],
      "slots": {}
    },
    {
      "component": "CardsGrid",
      "identifier": "cards_grid",
      "content": {},
      "config": {},
      "items": [
        {"title": "Grosses Gebrüll im Zoo!", "teaser": "...", "image": {"source": "..."}, "link": {"entity_unique_id": "..."}},
        {"title": "Neuer Erlebnisbereich", "teaser": "...", "image": {"source": "..."}, "link": {"entity_unique_id": "..."}}
      ],
      "slots": {}
    },
    {
      "component": "SlotContainer",
      "identifier": "slotcontainer",
      "content": {},
      "config": {},
      "items": [],
      "slots": {
        "content": {
          "identifier": "content",
          "content": [
            {
              "component": "Text",
              "identifier": "text_element",
              "content": {"content": {"html": "<p>Inhalt in einem Slot.</p>", "json": {...}}}
            }
          ]
        }
      }
    }
  ]
}
```

**What we learn from this homepage:**
- We need **4 React components**: `HeroBanner`, `Text`, `CardsGrid`, `SlotContainer`
- `HeroBanner` receives `content.title`, `content.teaser`, `content.image.source`
- `Text` receives `content.content.html` (raw HTML) and `content.content.json` (ProseMirror/TipTap JSON for WYSIWYG rendering)
- `CardsGrid` uses `items` (not `content`) — it's a mapped content pool. Each item has `title`, `teaser`, `image.source`, `link.entity_unique_id`
- `SlotContainer` uses `slots` — it has a slot called `"content"` that contains nested blocks

---

## 3. Project Setup

Add the `@flyo/nitro-next` package to your Next.js project:

```bash
npm install @flyo/nitro-next
```

> **CRITICAL**: This library only works with the **Next.js App Router**. It does NOT work with the Pages Router. Make sure your project uses the `app/` directory (not `pages/`).

> **CRITICAL**: Requires **Next.js >= 16.0.4**, **React >= 19.2.1**, **React DOM >= 19.2.1**.

### Folder Structure

Your `src/` directory should look like this when complete:

```
src/
├── flyo.config.tsx          # Flyo configuration & component registry
├── proxy.ts                 # Cache control middleware
├── app/
│   ├── layout.tsx           # Root layout with navigation
│   ├── not-found.tsx        # 404 page
│   ├── sitemap.ts           # Auto-generated sitemap
│   └── [[...slug]]/
│       └── page.tsx         # ← THE ONLY PAGE ROUTE NEEDED (catches all CMS pages)
└── components/
    ├── HeroBanner.tsx       # One component per block type
    ├── Text.tsx
    ├── CardsGrid.tsx
    └── ...
```

---

## 4. Environment Variables

Create a `.env.local` file in the project root:

```bash
# Flyo Configuration
FLYO_ACCESS_TOKEN=INSERT_YOUR_FLYO_ACCESS_TOKEN_HERE
FLYO_LIVE_EDIT=true
SITE_URL=http://localhost:3000
```

- `FLYO_ACCESS_TOKEN`: Your Flyo Nitro API token
- `FLYO_LIVE_EDIT`: Set to `true` during development to enable live preview in the Flyo editor. Set to `false` in production.
- `SITE_URL`: Your site's base URL (used for sitemap generation and canonical URLs)

---

## 5. Flyo Configuration File

Create `src/flyo.config.tsx`. This is the central configuration file that:
1. Initializes the Flyo Nitro connection
2. Registers all block components
3. Exports a `Flyo` wrapper component for the layout

```tsx
import type { ReactNode } from 'react';
import { initNitro } from '@flyo/nitro-next/server';
import { FlyoClientWrapper } from '@flyo/nitro-next/client';

// Import ALL your block components here
// (Create these in step 9 based on the homepage response)
import { HeroBanner } from './components/HeroBanner';
import { Text } from './components/Text';
// import { CardsGrid } from './components/CardsGrid';
// import { SlotContainer } from './components/SlotContainer';

const accessToken = process.env.FLYO_ACCESS_TOKEN || '';
const liveEdit = process.env.FLYO_LIVE_EDIT === 'true';
const baseUrl = process.env.SITE_URL || 'http://localhost:3000';

export const flyoConfig = initNitro({
  accessToken: accessToken,
  lang: 'de',           // ← Set this to match your config response's nitro.language
  baseUrl: baseUrl,
  liveEdit: liveEdit,
  serverCacheTtl: 1200, // CDN cache: 20 minutes
  clientCacheTtl: 900,  // Browser cache: 15 minutes
  // IMPORTANT: Map EVERY block component name from the homepage response here.
  // The keys MUST match the "component" field from the API response exactly.
  components: {
    HeroBanner: HeroBanner,
    Text: Text,
    // CardsGrid: CardsGrid,
    // SlotContainer: SlotContainer,
  }
});

/**
 * Flyo wrapper component — use this in your root layout.
 * In live edit mode, it wraps children with FlyoClientWrapper for real-time updates.
 */
export function Flyo({ children }: { children: ReactNode }) {
  flyoConfig();

  if (liveEdit) {
    return <FlyoClientWrapper>{children}</FlyoClientWrapper>;
  }

  return children;
}
```

### How to Determine What to Register

Look at the **homepage response** `json` array. For each unique `component` value, you need:
1. A React component file in `src/components/`
2. An entry in the `components` map above

The key in the map must **exactly match** the `component` string from the API (case-sensitive).

---

## 6. Middleware Proxy

Create `src/proxy.ts` (Next.js middleware file for cache control):

```ts
import { createProxy } from '@flyo/nitro-next/proxy';
import { flyoConfig } from './flyo.config';

export default createProxy(flyoConfig());

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

This middleware:
- Sets `Cache-Control` headers with `s-maxage` (CDN) and `max-age` (browser) based on your TTL config
- Disables caching entirely when `liveEdit` is `true`

> **Note**: In Next.js the middleware file must be at `src/proxy.ts` (or `src/middleware.ts` — the proxy IS the middleware). The file is placed at `src/proxy.ts` because `createProxy` returns a Next.js middleware function.

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

  // Extract navigation items from the container
  // IMPORTANT: Use the container identifier from your config response
  // In this example, the container is called "nav"
  const navContainer = config?.containers?.nav;
  const navItems: ContainerPage[] = navContainer && !Array.isArray(navContainer) 
    ? (navContainer.items || []) 
    : [];

  return (
    <Flyo>
      <html lang={config?.nitro?.language || 'en'}>
        <body>
          <NitroDebugInfo config={config} />
          
          {/* Navigation Header */}
          <header>
            <nav>
              <ul style={{ display: 'flex', gap: '1rem', listStyle: 'none', padding: '1rem' }}>
                {navItems.map((item: ContainerPage, index: number) => (
                  <li key={index}>
                    <Link href={item.href || '#'} target={item.target}>
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </header>

          {/* Page Content */}
          <main>{children}</main>
        </body>
      </html>
    </Flyo>
  );
}
```

### Navigation Containers

The config response may have multiple containers (e.g., `nav`, `footer`, `sidebar`). Access each one by its identifier:

```tsx
const footerContainer = config?.containers?.footer;
const footerItems = footerContainer && !Array.isArray(footerContainer) 
  ? (footerContainer.items || []) 
  : [];
```

### Nested Navigation

If navigation items have `children`, render them recursively:

```tsx
function NavItem({ item }: { item: ContainerPage }) {
  return (
    <li>
      <Link href={item.href || '#'}>{item.label}</Link>
      {item.children && item.children.length > 0 && (
        <ul>
          {item.children.map((child, i) => (
            <NavItem key={i} item={child} />
          ))}
        </ul>
      )}
    </li>
  );
}
```

### Global Data

If the config response has `globals` data, access it to render site-wide content (e.g., footer locations):

```tsx
const locations = config?.globals?.locations || [];
```

---

## 8. Catch-All Page Route

Create `src/app/[[...slug]]/page.tsx`:

```tsx
export {
  nitroPageRoute as default,
  nitroPageGenerateMetadata as generateMetadata,
} from '@flyo/nitro-next/server';
```

**That's it.** This single 4-line file handles:
- The homepage (`/`)
- All CMS pages (`/news`, `/about`, `/contact`, etc.)
- Nested pages (`/blog/my-post`)
- 404 handling for unknown slugs
- SEO metadata generation from the CMS `meta_json`

The `[[...slug]]` pattern is a Next.js **optional catch-all route**. The double brackets `[[ ]]` make the slug optional, so it matches both `/` (no slug) and `/any/path` (with slug).

The library internally:
1. Reads the slug from the URL
2. Checks if the slug exists in the config's `pages` array
3. Fetches the page data from the `/pages` API
4. Iterates over the `json` array and renders each block using the registered component
5. Returns `notFound()` if the slug doesn't exist

### Static Site Generation (SSG) — Production Only

To pre-render all pages at build time for production, add `generateStaticParams`:

```tsx
export {
  nitroPageRoute as default,
  nitroPageGenerateMetadata as generateMetadata,
  nitroPageGenerateStaticParams as generateStaticParams,
} from '@flyo/nitro-next/server';
```

> **WARNING**: Only enable `generateStaticParams` in production. When enabled, it pre-renders all pages at build time, which disables live preview in the Flyo editor.

---

## 9. Building Block Components

For each unique `component` value in the homepage API response, create a React component. Every component receives a `block` prop of type `Block`.

### General Component Pattern

```tsx
'use client';

import { Block } from '@flyo/nitro-typescript';
import { editable } from '@flyo/nitro-next/client';

export function ComponentName({ block }: { block: Block }) {
  return (
    <div {...editable(block)}>
      {/* Render block.content fields here */}
    </div>
  );
}
```

**Important rules:**
- Components must be `'use client'` (they use the `editable()` function which requires client-side interactivity)
- Always spread `{...editable(block)}` on the root element — this enables live editing in the Flyo CMS editor
- Access content fields via `block.content.fieldName`
- Access mapped items via `block.items` (array)
- Access configuration via `block.config.fieldName`
- Access nested blocks via `block.slots.slotName`

### Example: HeroBanner Component

Based on block data:
```json
{
  "component": "HeroBanner",
  "content": {
    "image": {"source": "https://...", "caption": null, "copyright": null},
    "title": "Welcome!",
    "teaser": "Subtitle text"
  }
}
```

Create `src/components/HeroBanner.tsx`:

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
        <img
          src={block.content.image.source}
          alt={block.content.image.caption || ''}
          style={{ maxWidth: '100%' }}
        />
      )}
    </section>
  );
}
```

### Example: Text/WYSIWYG Component

Based on block data:
```json
{
  "component": "Text",
  "content": {
    "content": {
      "html": "<h2>Title</h2><p>Text...</p>",
      "json": {"type": "doc", "content": [...]}
    }
  }
}
```

Create `src/components/Text.tsx`:

```tsx
'use client';

import { Block } from '@flyo/nitro-typescript';
import { editable } from '@flyo/nitro-next/client';
import { FlyoWysiwyg } from '@flyo/nitro-next/client';

export function Text({ block }: { block: Block }) {
  return (
    <div {...editable(block)} style={{ padding: '1rem', margin: '2rem 0' }}>
      <FlyoWysiwyg json={block.content.content.json} />
    </div>
  );
}
```

> **Note**: Use `FlyoWysiwyg` with the `json` field (ProseMirror/TipTap format) for proper rendering. Alternatively, you can use `block.content.content.html` with `dangerouslySetInnerHTML` for simple cases.

### Example: Cards Grid Component (with `items`)

Based on block data:
```json
{
  "component": "CardsGrid",
  "items": [
    {"title": "Card 1", "teaser": "...", "image": {"source": "..."}, "link": {"entity_unique_id": "abc123"}}
  ],
  "content": {}
}
```

Create `src/components/CardsGrid.tsx`:

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

### Example: Slot Container Component (with nested blocks)

Based on block data:
```json
{
  "component": "SlotContainer",
  "slots": {
    "content": {
      "identifier": "content",
      "content": [
        {"component": "Text", "content": {...}}
      ]
    }
  }
}
```

The `SlotContainer` is a **server component** because it uses `NitroSlot`:

Create `src/components/SlotContainer.tsx`:

```tsx
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

> **Note**: Components using `NitroSlot` must be **server components** (no `'use client'` directive). They also do NOT use the `editable()` helper, since that is client-only. The `NitroSlot` component automatically renders all nested blocks recursively.

---

## 10. Not Found Page

Create `src/app/not-found.tsx`:

```tsx
export default function NotFoundPage() {
  return <h1>Page not found</h1>;
}
```

The `@flyo/nitro-next` library automatically calls `notFound()` when a requested slug is not in the config's `pages` array.

---

## 11. Sitemap Generation

Create `src/app/sitemap.ts`:

```ts
import { nitroSitemap } from '@flyo/nitro-next/server';
import { flyoConfig } from '../flyo.config';

export default async function sitemap() {
  return nitroSitemap(flyoConfig());
}
```

This auto-generates `/sitemap.xml` from all CMS pages and mapped entities.

---

## 12. Image Optimization

Use the `FlyoCdnLoader` with Next.js `Image` component for optimized images through Flyo's CDN:

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

The loader automatically:
- Adds the Flyo CDN host (`storage.flyo.cloud`) if not already present
- Applies width-based transformations
- Converts images to WebP format

---

## 13. Nested Blocks (Slots)

Some blocks contain slots — containers for child blocks. The `NitroSlot` server component renders them recursively:

```tsx
// Server component only — no 'use client'
import { NitroSlot } from '@flyo/nitro-next/server';
import { Block } from '@flyo/nitro-typescript';

export function Container({ block }: { block: Block }) {
  return (
    <div>
      <h2>{block.content?.title}</h2>
      <NitroSlot slot={block.slots?.content} />
    </div>
  );
}
```

The slot data from the API looks like:
```json
"slots": {
  "content": {
    "identifier": "content",
    "content": [
      { "component": "Text", ... },
      { "component": "HeroBanner", ... }
    ]
  }
}
```

Each entry in `content` is a regular block that gets rendered by its registered component.

---

## 14. API Reference Summary

### Imports from `@flyo/nitro-next/server`

| Export | Description |
|--------|-------------|
| `initNitro(config)` | Initialize Flyo configuration. Returns a function that returns `NitroState`. |
| `getNitroConfig()` | Fetch and cache the config response (navigation, pages, globals). |
| `getNitroPages()` | Get the Pages API instance for fetching page data. |
| `getNitroEntities()` | Get the Entities API instance for fetching entity data. |
| `getNitroSearch()` | Get the Search API instance for searching content. |
| `getNitro()` | Access the current Nitro state after initialization. |
| `nitroPageRoute` | Default page route handler — use as the default export of `[[...slug]]/page.tsx`. |
| `nitroPageGenerateMetadata` | Generate SEO metadata for pages. |
| `nitroPageGenerateStaticParams` | Generate static params for SSG (production only). |
| `nitroEntityRoute(props, options)` | Entity detail page handler with custom resolver. |
| `nitroEntityGenerateMetadata(props, options)` | Generate metadata for entity pages. |
| `nitroSitemap(state)` | Generate Next.js sitemap from CMS content. |
| `NitroPage` | Server component that renders all blocks on a page. |
| `NitroBlock` | Server component that renders a single block. |
| `NitroSlot` | Server component that renders nested blocks from a slot. |
| `NitroDebugInfo` | Server component that outputs debug info as HTML comment. |

### Imports from `@flyo/nitro-next/client`

| Export | Description |
|--------|-------------|
| `editable(block)` | Returns data attributes for Flyo live editor integration. Spread on root element. |
| `FlyoClientWrapper` | Wrapper component for live editing mode. Used internally by the `Flyo` component. |
| `FlyoWysiwyg` | Renders ProseMirror/TipTap JSON content with optional custom node components. |
| `FlyoCdnLoader` | Image loader for Next.js Image component with Flyo CDN optimization. |
| `FlyoMetric` | Tracking component for entity metrics (production only). |

### Imports from `@flyo/nitro-next/proxy`

| Export | Description |
|--------|-------------|
| `createProxy(state)` | Create Next.js middleware for cache control. |

### Imports from `@flyo/nitro-typescript`

| Export | Description |
|--------|-------------|
| `Block` | TypeScript type for a page block. |
| `Entity` | TypeScript type for an entity. |
| `Page` | TypeScript type for a page. |
| `ConfigResponse` | TypeScript type for the config API response. |
| `ContainerPage` | TypeScript type for a navigation container page item. |

---

## 15. Common Mistakes to Avoid

1. **Missing component registration**: Every `component` value from the API response must be registered in `initNitro({ components: { ... } })`. If a block's component is not registered, it shows a placeholder (in dev) or nothing (in prod).

2. **Wrong component key**: The key in the components map must **exactly match** the `component` field from the API (case-sensitive). `"HeroBanner"` ≠ `"heroBanner"`.

3. **Using Pages Router**: This library only works with **Next.js App Router**. The `app/` directory is required.

4. **Forgetting `'use client'`**: All components using `editable()`, `FlyoWysiwyg`, `FlyoCdnLoader`, or `FlyoMetric` must have the `'use client'` directive.

5. **Using `NitroSlot` in client components**: `NitroSlot` is a server component. It cannot be used in `'use client'` files. Components that use `NitroSlot` must be server components.

6. **Enabling `generateStaticParams` in development**: This pre-renders all pages at build time and disables live preview. Only enable it for production.

7. **Forgetting `editable(block)`**: Always spread `{...editable(block)}` on the root element of block components. Without it, live editing in the Flyo CMS editor won't work.

8. **Wrong image structure**: Flyo images are objects `{source, caption, copyright}`, not plain strings. Use `block.content.image.source` to get the URL.

9. **Wrong WYSIWYG image src**: In WYSIWYG nodes, image `src` is also an object `{source, caption, copyright}`. Use `node.attrs.src.source`.

10. **Not wrapping layout with `<Flyo>`**: The root layout must be wrapped with the `<Flyo>` component from `flyo.config.tsx`.

11. **Hardcoding navigation**: Navigation should be dynamic from `config.containers`, not hardcoded. The CMS controls which pages appear in which navigation.

12. **Creating multiple page routes**: You only need ONE catch-all route `[[...slug]]/page.tsx`. Do NOT create separate `/about/page.tsx`, `/news/page.tsx`, etc. for CMS pages. The catch-all route handles all of them.

---

## Quick Start Checklist

- [ ] Ensure Next.js project uses App Router with `src/` directory
- [ ] `npm install @flyo/nitro-next`
- [ ] Create `.env.local` with `FLYO_ACCESS_TOKEN`, `FLYO_LIVE_EDIT`, `SITE_URL`
- [ ] Create `src/flyo.config.tsx` with all block components registered
- [ ] Create `src/proxy.ts` for cache control middleware
- [ ] Create `src/app/layout.tsx` wrapped with `<Flyo>`, include navigation from config containers
- [ ] Create `src/app/[[...slug]]/page.tsx` (4 lines — re-export from library)
- [ ] Create `src/app/not-found.tsx`
- [ ] Create `src/app/sitemap.ts`
- [ ] Create one React component per block type in `src/components/`
- [ ] Run `npm run dev` and verify all pages render correctly



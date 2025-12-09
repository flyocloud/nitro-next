# Flyo Nitro for Next.Js

<p align="center">
  <img src="https://storage.flyo.cloud/12_K6uT5tY4TwXRL3_flyo-logo-colored.png" alt="Flyo" width="140" />
  &nbsp;&nbsp;&nbsp;&nbsp;
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/nextjs/nextjs-original.svg" alt="Next.js" width="160" />
</p>

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

// Get configuration from environment variables
const accessToken = process.env.FLYO_ACCESS_TOKEN || '';
const liveEdit = process.env.FLYO_LIVE_EDIT === 'true';

export const flyoConfig = initNitro({
  accessToken: accessToken,
  lang: 'en',
  showMissingComponentAlert: liveEdit, // whether an alert about missing components should be shown or not
  components: { // see the custom components section 5. for more info
    HeroBanner: HeroBanner
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

### 3. Setup Layout

Wrap your application with the provider in `app/layout.tsx`.

```tsx
import { Flyo } from '@/flyo.config';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <Flyo>
      <html>
        <body>{children}</body>
      </html>
    </Flyo>
  );
}
```

### 4. Create Page

Create a catch-all route in `app/[[...slug]]/page.tsx` to handle dynamic pages.

```tsx
// Re-export the Nitro route handlers for a one-liner setup
export {
  nitroPageRoute as default,
  nitroPageGenerateMetadata as generateMetadata,
  nitroPageGenerateStaticParams as generateStaticParams,
} from "@flyo/nitro-next/server";
```

### 5. Create Custom Components

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

### 6. WYSIWYG Component

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
// components/CustomImage.tsx
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

Then use it with the WYSIWYG component:

```tsx
'use client';

import { FlyoWysiwyg } from '@flyo/nitro-next/client';
import CustomImage from './components/CustomImage';

export default function MyComponent({ block }) {
  return (
    <FlyoWysiwyg 
      json={block.content.json} 
      components={{
        image: CustomImage
      }} 
    />
  );
}
```

The component will use your custom `CustomImage` component for all `image` nodes, and render all other nodes using the default WYSIWYG renderer.

### 7. Entity Detail Pages

Nitro provides flexible helpers for creating entity detail pages with any route structure. You define a **resolver function** that fetches the entity from your route params, and the library handles caching and rendering.

#### Example 1: Entity by Slug

Create `app/blog/[slug]/page.tsx`:

```tsx
import { 
  nitroEntityRoute, 
  nitroEntityGenerateMetadata, 
  getNitroEntities,
  type Entity,
  type EntityResolver
} from "@flyo/nitro-next/server";

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
      <article>
        <h1>{entity.entity?.entity_title}</h1>
        <p>{entity.entity?.entity_teaser}</p>
        {/* Access all entity data here */}
      </article>
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
  type Entity,
  type EntityResolver
} from "@flyo/nitro-next/server";

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
      <div>
        <h1>{entity.entity?.entity_title}</h1>
      </div>
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
  type Entity,
  type EntityResolver
} from "@flyo/nitro-next/server";

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
      <div>
        <h1>{entity.entity?.entity_title}</h1>
        <p>{entity.entity?.entity_teaser}</p>
      </div>
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

## API Reference

### Client Exports

- **`editable(block)`** – Returns the `data-flyo-uid` attributes to wire blocks into the Flyo live editor.
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
- **`NitroPage`** – Server component that renders a whole Nitro page by delegating to `NitroBlock` for each block.
  ```tsx
  import { NitroPage } from '@flyo/nitro-next/server';
  ```
- **`NitroBlock`** – Low-level renderer that looks up and renders the registered component for a block, or shows a placeholder if missing.
  ```tsx
  import { NitroBlock } from '@flyo/nitro-next/server';
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
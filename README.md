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
import { NitroPage, getNitroConfig, getNitroPages } from "@flyo/nitro-next/server";
import { notFound } from 'next/navigation';

export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const path = slug?.join('/') ?? '';

  // Check if page exists in config
  const cfg = await getNitroConfig();
  if (!cfg.pages?.includes(path)) {
    notFound();
  }

  // Fetch page data
  const page = await getNitroPages().page({ slug: path });

  return <NitroPage page={page} />;
}
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
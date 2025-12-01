# Flyo Nitro Next

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
  components: {
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

#### Example: HeroBanner Component

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

#### Basic Usage

```tsx
'use client';

import { FlyoWysiwyg } from '@flyo/nitro-next/client';

export default function MyComponent({ block }) {
  return (
    <FlyoWysiwyg json={block.content.json} />
  );
}
```

#### With Custom Components

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

- **`editable(block)`** - Helper function that returns props to make a block editable in the Flyo live editor
- **`FlyoClientWrapper`** - Client-side wrapper component for live editing functionality
- **`FlyoWysiwyg`** - Component for rendering ProseMirror/TipTap JSON content

### Server Exports

- **`initNitro(config)`** - Initialize Nitro with your configuration
- **`getNitroConfig()`** - Get the current Nitro configuration
- **`getNitroPages()`** - Get the Nitro pages API
- **`NitroPage`** - Server component for rendering Nitro pages

## Development

This is a workspace-based project using npm workspaces.

```bash
# Install dependencies
npm install

# run dev & start the playground
npm run dev
npm run playground
```
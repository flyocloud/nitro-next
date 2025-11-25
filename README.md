# Flyo Nitro Next

## Usage

### 1. Installation

```bash
npm install @flyo/nitro-next
```

### 2. Configuration

Create a `flyo.config.tsx` file to configure the library and your components.

```tsx
import { initNitro } from '@flyo/nitro-next';
import { HeroBanner } from './components/HeroBanner';

const flyoConfig = initNitro({
  accessToken: 'YOUR_ACCESS_TOKEN',
  components: {
    HeroBanner: HeroBanner
  }
});

export function FlyoProvider({ children }: { children: React.ReactNode }) {
  flyoConfig();
  return children;
}
```

### 3. Setup Layout

Wrap your application with the provider in `app/layout.tsx`.

```tsx
import { FlyoProvider } from '@/flyo.config';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <FlyoProvider>
      <html>
        <body>{children}</body>
      </html>
    </FlyoProvider>
  );
}
```

### 4. Create Page

Create a catch-all route in `app/[[...slug]]/page.tsx` to handle dynamic pages.

```tsx
import { NitroPage, getNitroConfig, getNitroPages } from "@flyo/nitro-next";
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

## Development

This is a workspace-based project using npm workspaces.

```bash
# Install dependencies
npm install

# run dev & start the playground
npm run dev
npm run playground
```
# Upgrading from v1 to v2

## Overview

v2 replaces the global singleton architecture with an **instance-based** design. Instead of `initNitro()` setting global state and standalone helper functions reading from it, `initNitro()` now returns a `FlyoInstance` object that contains all API methods.

**Why?** The v1 global singleton caused race conditions with Next.js parallel routes, where module execution order is not guaranteed. With v2, every file imports and uses the same `flyo` instance — no hidden global state, no side-effect imports.

## Migration Steps

### 1. Configuration File (`flyo.config.tsx`)

**Before (v1):**
```tsx
import { initNitro } from '@flyo/nitro-next/server';
import { FlyoClientWrapper } from '@flyo/nitro-next/client';

export const flyoConfig = initNitro({ accessToken, liveEdit, components: { ... } });

export function Flyo({ children }) {
  flyoConfig(); // side-effect call to initialize global state
  if (liveEdit) return <FlyoClientWrapper>{children}</FlyoClientWrapper>;
  return children;
}
```

**After (v2):**
```tsx
import { initNitro } from '@flyo/nitro-next/server';
import { FlyoClientWrapper } from '@flyo/nitro-next/client';

// initNitro() returns a FlyoInstance — no side-effect call needed
export const flyo = initNitro({ accessToken, liveEdit, components: { ... } });

export function FlyoProvider({ children }) {
  if (liveEdit) return <FlyoClientWrapper>{children}</FlyoClientWrapper>;
  return <>{children}</>;
}
```

### 2. Layout (`layout.tsx`)

**Before (v1):**
```tsx
import { Flyo } from '@/flyo.config';
import { getNitroConfig, NitroDebugInfo } from '@flyo/nitro-next/server';

const config = await getNitroConfig();
<Flyo>
  <NitroDebugInfo config={config} />
</Flyo>
```

**After (v2):**
```tsx
import { FlyoProvider, flyo } from '@/flyo.config';
import { NitroDebugInfo } from '@flyo/nitro-next/server';

const config = await flyo.getNitroConfig();
<FlyoProvider>
  <NitroDebugInfo flyo={flyo} />
</FlyoProvider>
```

### 3. Proxy (`proxy.ts`)

**Before (v1):**
```tsx
import { createProxy } from '@flyo/nitro-next/proxy';
import { flyoConfig } from './flyo.config';
export default createProxy(flyoConfig());
```

**After (v2):**
```tsx
import { createProxy } from '@flyo/nitro-next/proxy';
import { flyo } from './flyo.config';
export default createProxy(flyo);
```

### 4. Page Route (`[[...slug]]/page.tsx`)

**Before (v1):**
```tsx
export {
  nitroPageRoute as default,
  nitroPageGenerateMetadata as generateMetadata,
} from "@flyo/nitro-next/server";
```

**After (v2):**
```tsx
import { nitroPageRoute, nitroPageGenerateMetadata } from "@flyo/nitro-next/server";
import { flyo } from "@/flyo.config";

export default nitroPageRoute(flyo);
export const generateMetadata = nitroPageGenerateMetadata(flyo);
```

### 5. Custom Page with `pageResolveRoute`

**Before (v1):**
```tsx
import { nitroPageResolveRoute, NitroPage } from '@flyo/nitro-next/server';
const { page } = await nitroPageResolveRoute(props);
<NitroPage page={page} />
```

**After (v2):**
```tsx
import { NitroPage } from '@flyo/nitro-next/server';
import { flyo } from '@/flyo.config';
const { page } = await flyo.pageResolveRoute(props);
<NitroPage page={page} flyo={flyo} />
```

### 6. Entity Pages

**Before (v1):**
```tsx
import { nitroEntityRoute, nitroEntityGenerateMetadata, getNitroEntities } from "@flyo/nitro-next/server";

const resolver = async (params) => {
  const { slug } = await params;
  return getNitroEntities().entityBySlug({ slug, typeId: 123 });
};

export const generateMetadata = (props) => nitroEntityGenerateMetadata(props, { resolver });
export default function Page(props) {
  return nitroEntityRoute(props, { resolver, render });
}
```

**After (v2):**
```tsx
import { nitroEntityRoute, nitroEntityGenerateMetadata } from "@flyo/nitro-next/server";
import { flyo } from "@/flyo.config";

const resolver = async (params) => {
  const { slug } = await params;
  return flyo.getNitroEntities().entityBySlug({ slug, typeId: 123 });
};

export const generateMetadata = nitroEntityGenerateMetadata(flyo, { resolver });
export default nitroEntityRoute(flyo, { resolver, render });
```

### 7. Sitemap

**Before (v1):**
```tsx
import { nitroSitemap } from '@flyo/nitro-next/server';
import { flyoConfig } from '../flyo.config';
export default async function sitemap() {
  return nitroSitemap(flyoConfig());
}
```

**After (v2):**
```tsx
import { flyo } from '@/flyo.config';
export default async function sitemap() {
  return flyo.sitemap();
}
```

### 8. Components with `NitroSlot`

**Before (v1):**
```tsx
import { NitroSlot } from '@flyo/nitro-next/server';
<NitroSlot slot={block.slots?.content} />
```

**After (v2):**
```tsx
import { NitroSlot } from '@flyo/nitro-next/server';
import { flyo } from '@/flyo.config';
<NitroSlot slot={block.slots?.content} flyo={flyo} />
```

## Removed Exports

The following exports have been removed in v2:

| Removed | Replacement |
|---------|-------------|
| `getNitroConfig()` | `flyo.getNitroConfig()` |
| `getNitroPages()` | `flyo.getNitroPages()` |
| `getNitroEntities()` | `flyo.getNitroEntities()` |
| `getNitroSitemap()` | `flyo.getNitroSitemap()` |
| `getNitroSearch()` | `flyo.getNitroSearch()` |
| `getNitro()` | `flyo.state` |
| `globalNitroState` | `flyo.state` |
| `nitroPageResolveRoute()` | `flyo.pageResolveRoute()` |
| `nitroSitemap()` | `flyo.sitemap()` |

## Parallel Routes

The v1 parallel routes caveat (requiring `import '../../../flyo.config'` side-effect imports) is **no longer needed** in v2. Since every file directly imports the `flyo` instance, there is no hidden global state and no initialization race condition.

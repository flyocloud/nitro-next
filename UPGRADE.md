# Upgrading from v2.0 to v2.1

## Overview

v2.1 adds **multilanguage (i18n)** support. It is **fully backward compatible**: if you don't set the new `locales` / `defaultLocale` options, nothing changes — your single-language site behaves exactly as on v2.0. Nothing is removed or renamed, so **no code changes are required** to keep your current behavior.

What's new:

- `locales` and `defaultLocale` options on `initNitro()`.
- The proxy auto-detects the locale from the first URL segment and sets an `x-flyo-locale` request header (only when `locales` is configured).
- `getNitroConfig(lang?)` takes an optional locale and is cached **per locale**; with no argument it resolves the active request locale automatically.
- `flyo.pageResolveRoute()` now also returns the resolved `lang`.
- New `flyo.getRequestLocale()` helper.
- New `getLanguageLinks()` helper (typed language-switcher data) + `FlyoLanguageLink` type — exported from both `/server` and `/client`.
- `nitroPageGenerateMetadata` / `nitroEntityGenerateMetadata` automatically emit `hreflang` alternates from `translation[]`.

The steps below are only needed to **turn on** multilanguage.

## Turning on multilanguage

Flyo's model: page slugs are language-prefixed and globally unique (`de/erleben`, `en/experience`), and `config.pages[]` lists every language — so your existing catch-all route already resolves localized pages. Only navigation/globals (config) and entities need the active `lang`. See the README **"Multilanguage (i18n)"** section for the full explanation.

### 1. Declare your locales — `flyo.config.tsx`

```diff
 export const flyo = initNitro({
   accessToken,
   baseUrl,
   liveEdit,
+  defaultLocale: 'de',      // primary language (config.nitro.primary_language)
+  locales: ['de', 'en'],    // all supported locales
   serverCacheTtl: 1200,
   clientCacheTtl: 900,
   components: { /* … */ },
 });
```

### 2. Proxy — no change

With `locales` configured, `createProxy(flyo)` also detects the locale and sets the `x-flyo-locale` header. Your `proxy.ts` file stays as-is.

### 3. Layout — `<html lang>` + localized nav

`getNitroConfig()` (no argument) now returns the nav in the active locale; use the response's `nitro.language` for `<html lang>`:

```diff
 export default async function RootLayout({ children }) {
   const config = await flyo.getNitroConfig();
+  const lang = config.nitro?.language;

   return (
-    <html>
+    <html lang={lang}>
       <body>{/* nav from config.containers … */}{children}</body>
     </html>
   );
 }
```

### 4. Entity detail routes — add a `[lang]` segment

An entity's slug is shared across languages, so you must pass `lang`. Move the route under a `[lang]` segment and read it from `params`:

```diff
- // app/blog/[slug]/page.tsx
+ // app/[lang]/blog/[slug]/page.tsx
- const resolver: EntityResolver<{ slug: string }> = async (params) => {
-   const { slug } = await params;
-   return flyo.getNitroEntities().entityBySlug({ slug, typeId: 246 });
- };
+ const resolver: EntityResolver<{ lang: string; slug: string }> = async (params) => {
+   const { lang, slug } = await params;
+   return flyo.getNitroEntities().entityBySlug({ slug, typeId: 246, lang });
+ };
```

### 5. Language switcher (optional)

`getLanguageLinks()` returns typed data (no markup), so you render the switcher. Pass `flyo.state.locales` to also get fallback entries for locales with no translation:

```tsx
import { getLanguageLinks } from '@flyo/nitro-next/server'; // also from '/client'

const { page, lang } = await flyo.pageResolveRoute(props);
const links = getLanguageLinks(page.translation, { currentLang: lang, locales: flyo.state.locales });
// each link: { shortcode, name?, href, title?, isCurrent, exists }
```

### 6. hreflang — automatic

Nothing to do: `nitroPageGenerateMetadata` and `nitroEntityGenerateMetadata` emit `alternates.languages` from `translation[]`.

## New API in v2.1 (all additive)

| Added | Where | Description |
|-------|-------|-------------|
| `initNitro({ locales, defaultLocale })` | `/server` | Declare supported locales + primary language. |
| `flyo.getRequestLocale()` | instance | Active request locale (header → `defaultLocale`). |
| `flyo.getNitroConfig(lang?)` | instance | Optional per-locale config (previously no-arg). |
| `flyo.pageResolveRoute()` → `{ page, path, lang, cfg }` | instance | Now also returns the resolved locale. |
| `getLanguageLinks()` / `FlyoLanguageLink` | `/server` + `/client` | Typed language-switcher data. |

---

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

If your editor enables `react-refresh/only-export-components`, split these into two files:

- keep `flyo.config.ts` for `flyo`, `liveEdit`, and other non-component exports
- move `FlyoProvider` into its own `.tsx` file

That avoids the Fast Refresh warning while keeping the v2 instance-based architecture unchanged.

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

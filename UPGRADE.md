# Upgrading from v2.1 to v2.2

> This guide is written for both humans and AI coding agents. Steps are explicit
> enough to follow by hand and precise enough to apply programmatically.

## Overview

v2.2 is **additive and fully backward compatible** — nothing is removed or
renamed, so **no code changes are required** to keep your current behavior. If
you don't render a language switcher, or your site is single-language, there is
**nothing to do**.

What v2.2 adds is a clean way to render a **language switcher in shared chrome** —
a footer (or header) that lives in your **root layout** (`app/layout.tsx`).

What's new:

- **`readLanguageLinks()` / `publishLanguageLinks()`** (`@flyo/nitro-next/server`) —
  a request-scoped store. The active route *publishes* its language-switcher
  links; a component anywhere in the layout *reads* them by awaiting
  `readLanguageLinks()`.
- **Page and entity routes now publish automatically.** `pageResolveRoute`,
  `nitroPageRoute`, `nitroEntityRoute`, and `nitroEntityGenerateMetadata` push the
  resolved links into the store for you — no extra code on those routes.
- **`createLanguageLinksStore()` / `LanguageLinksStore`** (`@flyo/nitro-next/server`) —
  the low-level primitive behind the store. You rarely need it directly.

## Why this exists

The switcher's data — a page's or entity's `translation[]` — is only available
where the content is resolved (the page route, the entity routes). But the
switcher itself almost always lives in shared chrome in the **root layout**, and
in the App Router the layout is an **ancestor** of the page: data flows *down*,
so the layout **cannot receive `page.translation` as a prop**. In v2.1 there was
no clean bridge across that gap. v2.2 adds one: routes publish, the footer reads.

Because the reader **awaits** a promise, it does not matter that the root layout
renders before the page — `await` suspends the switcher until the active route
publishes.

## What to do

### If your site is single-language, or you have no switcher

Nothing. v2.2 changes no behavior you rely on.

### If your site is multilingual — build one switcher, read the store

You write exactly one component. It reads the store and renders links; page and
entity routes already publish, so it works on every content route with no other
change.

```tsx
// components/LanguageSwitcher.tsx — a server component
import { readLanguageLinks } from '@flyo/nitro-next/server';

export async function LanguageSwitcher() {
  const links = await readLanguageLinks();
  if (links.length === 0) return null; // single-language site → no switcher

  return (
    <nav aria-label="Language">
      {links.map((l) =>
        l.exists ? (
          // Native <a>, NOT next/link — a language switch must reload the shared chrome.
          <a key={l.shortcode} href={l.href!} aria-current={l.isCurrent ? 'true' : undefined}>
            {l.name ?? l.shortcode}
          </a>
        ) : (
          <span key={l.shortcode} aria-disabled>{l.shortcode}</span>
        ),
      )}
    </nav>
  );
}
```

Drop it into the footer in your root layout, wrapped in `<Suspense>` so the rest
of the layout renders and streams while the switcher waits for the active route
to publish (`fallback={null}` shows nothing until it resolves):

```diff
  // app/layout.tsx
+ import { Suspense } from 'react';
+ import { LanguageSwitcher } from '@/components/LanguageSwitcher';

  export default async function RootLayout({ children }) {
    const config = await flyo.getNitroConfig();
    return (
      <html lang={config.nitro?.language}>
        <body>
          {/* nav … */}
          {children}
+         <footer>
+           <Suspense fallback={null}>
+             <LanguageSwitcher />
+           </Suspense>
+         </footer>
        </body>
      </html>
    );
  }
```

### Routes that Flyo does not resolve

`readLanguageLinks()` waits until *something* publishes. Page and entity routes
do that for you — **including a fallback before every `notFound()`**, so a real
404 that renders `not-found.tsx` still settles the store. Only a **hand-written
route** that renders the same footer *without* going through those helpers must
publish itself. `publishLanguageLinks()` accepts a plain `FlyoLanguageLink[]`, so
set the links by hand:

```tsx
// e.g. app/gallery/page.tsx — a hand-built page that exists in de + en
import { publishLanguageLinks } from '@flyo/nitro-next/server';
import { flyo } from '@/flyo.config';

export default async function GalleryPage() {
  const currentLang = await flyo.getRequestLocale();
  publishLanguageLinks([
    { shortcode: 'de', name: 'Deutsch', href: '/de/galerie', isCurrent: currentLang === 'de', exists: true },
    { shortcode: 'en', name: 'English', href: '/en/gallery', isCurrent: currentLang === 'en', exists: true },
  ]);
  return /* … */;
}
```

> ⚠️ **Do not publish from `not-found.tsx`.** In the App Router the root
> not-found boundary renders on **every** request, not only on real 404s, and it
> renders *synchronously* — ahead of a route's `await`ed CMS fetch. The store is
> first-write-wins, so publishing there settles it with the fallback before the
> real links arrive, and pages that *do* have translations show the home/fallback
> links. (Earlier v2.2 drafts of this guide suggested publishing here — that was
> the cause; remove it.) The page/entity helpers now publish the fallback for
> you before `notFound()`, so `not-found.tsx` needs no switcher code at all.

## Migrating a v2.1 switcher

If on v2.1 you computed `getLanguageLinks(page.translation, …)` inside the page
and rendered the switcher there, that **still works** — nothing was removed. To
move the switcher into shared chrome (a footer), delete the inline switcher from
the page and add the `LanguageSwitcher` component above; the page route already
publishes, so no data needs to be threaded through.

## New API in v2.2 (all additive)

| Added | Where | Description |
|-------|-------|-------------|
| `readLanguageLinks()` | `/server` | Await the active route's switcher links from shared chrome (footer, …). |
| `publishLanguageLinks(links)` | `/server` | Publish links for the current request. Page/entity routes call it automatically; call it by hand only on custom routes Flyo doesn't resolve — **never from `not-found.tsx`**. |
| `createLanguageLinksStore()` / `LanguageLinksStore` | `/server` | Low-level per-request store primitive behind the two functions above. |

Behavioral additions (no API change): `pageResolveRoute`, `nitroPageRoute`,
`nitroEntityRoute`, and `nitroEntityGenerateMetadata` now publish the resolved
links into the store — and also publish a fallback (one disabled entry per
locale) before every `notFound()`, so a real 404 settles the store instead of
leaving the switcher waiting.

---

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

> Render each switcher link as a native `<a href={l.href}>`, **not** `next/link`'s `<Link>`. A language switch must refresh the shared chrome (localized nav, footer, `<html lang>`) that lives in your root layout, and App Router soft navigation re-renders only the page segment — so `<Link>` leaves that chrome stale in the old language. A plain `<a>` forces a full server render in the new locale. Your normal nav links stay `<Link>`. See the README **"Language switcher"** section for the full rationale.

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

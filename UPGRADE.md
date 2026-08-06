# Upgrading from v2.3 to v2.4

> This guide is written for both humans and AI coding agents. Steps are explicit
> enough to follow by hand and precise enough to apply programmatically.

## Overview

v2.4 is **purely additive**. `FlyoCdnLoader` is unchanged and keeps working
exactly as before — nothing breaks, and doing nothing is a valid upgrade.

What's new: **`FlyoCdnLoaderCrop`**, a second image loader for images that are
displayed in a **fixed aspect ratio**. It exists because the existing loader
cannot honour an asset's **focal point**.

**Why the focal point was being ignored.** `FlyoCdnLoader` requests
`…/thumb/{width}xnull`, a ratio-preserving resize. Flyo applies an asset's focus
**only on crops with a fixed aspect ratio** — `250x250` uses the focus,
`250xnull` does not ([Flyo asset
docs](https://docs.flyo.cloud/doc/assets-images)). So every image ended up
scaled by the CDN and then cropped **by the browser** through
`object-fit: cover`, which always crops from the centre. Whatever focal point
an editor set in the content hub had no effect.

This could not be fixed from the call site. Next.js passes only
`{ src, width, quality }` to an image loader — the `height` prop never reaches
it — so no combination of `<Image>` props can make the CDN return a crop. The
aspect ratio has to be given to the loader itself, which is what the new factory
does.

## What to do

### If no image is displayed in a fixed aspect ratio

Nothing. Keep using `FlyoCdnLoader`.

### Switch fixed-ratio images to `FlyoCdnLoaderCrop`

**Where to look** — an image is a candidate whenever its rendered box has a
fixed ratio and the image is made to fill it. Typical signals in a client
project:

- `object-cover` / `object-fit: cover` on an `<Image>` (Tailwind: `object-cover`,
  often together with `aspect-square`, `aspect-video`, `aspect-[4/3]`)
- a wrapper with `aspect-*` / `aspect-ratio` and `<Image fill>` inside
- `<Image>` with `width`/`height` whose ratio is fixed by design rather than by
  the asset — avatars, teaser/card thumbnails, hero banners, logo grids
- any component where a portrait asset is shown in a landscape frame (or vice
  versa) — that is exactly where centre-cropping cuts off heads

**The change** — one option at the call site. `width`/`height` on `<Image>` stay
as they are; they describe the layout, the loader now describes the crop:

```diff
- import { FlyoCdnLoader } from '@flyo/nitro-next/client';
+ import { FlyoCdnLoaderCrop } from '@flyo/nitro-next/client';
+
+ // Module scope: create the loader once, not on every render.
+ const squareLoader = FlyoCdnLoaderCrop({ aspectRatio: 1 });

  export function Avatar({ block }) {
    return (
      <Image
-       loader={FlyoCdnLoader}
+       loader={squareLoader}
        src={block.content.image.source}
        alt={block.content.image.caption}
        width={700}
        height={700}
        className="object-cover"
      />
    );
  }
```

`aspectRatio` is `width / height`: `1` square, `16 / 9` widescreen, `4 / 3`,
`3 / 4` portrait. The loader derives the height for **every** width in the
generated `srcset`, so the request becomes `…/thumb/700x700?format=webp` — a
real crop, focal point applied.

**Two rules when applying this:**

1. **Create the loader outside `render`** — at module scope, or via `useMemo`.
   `FlyoCdnLoaderCrop({...})` returns a *new function* on each call, and a new
   `loader` identity on every render defeats React's reconciliation of the
   `<Image>`.
2. **Match `aspectRatio` to the CSS**, not to the asset. If the frame is
   `aspect-video`, pass `16 / 9`. A mismatch means the browser crops the
   already-cropped image a second time.

### Pass `maxWidth` when the source width is known

The CDN returns the **untouched original** for any request wider than the stored
asset — `…/thumb/1400x1400` on a 679×498 asset returns 679×498, uncropped, focus
ignored. `next/image` generates `srcset` candidates well beyond the rendered
size, so the crop can survive at small widths and vanish at large ones. If the
Flyo media field exposes the original dimensions, pass them:

```tsx
const loader = FlyoCdnLoaderCrop({
  aspectRatio: 16 / 9,
  maxWidth: block.content.image.width,
});
```

Without `maxWidth` the requested width is passed through untouched and the CDN
applies its own limits.

### If the project wraps `<Image>` in its own component

Projects generated from `ai-instructions-nextjs.md` usually have a
`components/flyo/FlyoImage.tsx`. Extend it with an optional `aspectRatio` (and
`maxWidth`) prop instead of touching every call site:

```tsx
'use client';

import { useMemo } from 'react';
import Image, { type ImageProps } from 'next/image';
import { FlyoCdnLoader, FlyoCdnLoaderCrop } from '@flyo/nitro-next/client';

type FlyoImageProps = Omit<ImageProps, 'loader'> & {
  aspectRatio?: number;
  maxWidth?: number;
};

export function FlyoImage({ aspectRatio, maxWidth, ...props }: FlyoImageProps) {
  const loader = useMemo(
    () => (aspectRatio ? FlyoCdnLoaderCrop({ aspectRatio, maxWidth }) : FlyoCdnLoader),
    [aspectRatio, maxWidth]
  );

  return <Image loader={loader} {...props} />;
}
```

Then the per-image change is `aspectRatio={16 / 9}` on the usages that render
into a fixed frame.

## API changes in v2.4

Added:

| Added | Where | Description |
|-------|-------|-------------|
| `FlyoCdnLoaderCrop(options?)` | `/client` (+ root) | Factory returning a `next/image` loader that requests `{width}x{height}`, so the CDN crops for real and applies the asset's focal point. |
| `FlyoCdnLoaderCropOptions` | `/client` (+ root) | `{ aspectRatio?: number; format?: string; maxWidth?: number }`. |

Options:

| Option | Default | Description |
|--------|---------|-------------|
| `aspectRatio` | – | `width / height`. Omitted → ratio-preserving `{width}xnull`, identical to `FlyoCdnLoader`. |
| `format` | `'webp'` | Output format passed to the CDN. |
| `maxWidth` | – | Optional upper bound for the requested width. Unset → passed through; the CDN applies its own limits. |

Nothing removed, nothing renamed, no behavioral change to existing code:

- `FlyoCdnLoader` still emits `{width}xnull` and is still the right loader for
  images rendered at their natural ratio.
- `FlyoCdnLoaderCrop()` **without** `aspectRatio` produces exactly the same URL
  as `FlyoCdnLoader`.
- Invalid `aspectRatio` / `maxWidth` values throw when the loader is created,
  not on every image request.

---

# Upgrading from v2.2 to v2.3

## Overview

v2.3 **fixes a bug in the v2.2 language-switcher pattern** and replaces the
low-level store API with **one drop-in component**. If your site is
single-language or has no switcher, there is **nothing to do**.

**The bug (v2.2):** a switcher in shared chrome — `readLanguageLinks()` in a
footer in the root layout — was only correct on **full page loads**. On **soft
(client-side) navigation** with `<Link>`, the App Router re-renders only the
page segment; the root layout, and the switcher HTML inside it, is preserved in
the browser as-is. The newly active route *did* publish its links on the
server, but the layout never re-rendered to read them. So after the first
`<Link>` click the switcher kept showing the **previous page's** language
links — and clicking a language sent the visitor to the wrong page.

**The fix (v2.3): `NitroLanguageSwitcher`.** One component in the layout that
handles both App Router pitfalls internally: it server-renders the correct
links into the first, full-document response (the route helpers publish them
into a request-scoped store), and it live-updates across soft navigations (the
route helpers also render an invisible client publisher that feeds a
client-side store before the browser paints).

What's new:

- **`NitroLanguageSwitcher`** (`@flyo/nitro-next/server`) — the complete
  switcher for shared chrome. You define it once via the required **`default`**
  prop: the locale set, the display **order**, and the **labels** (so you decide
  whether/how labels are translated). The active route's published links
  contribute only the translated **hrefs**. Renders built-in semantic markup,
  or your own via the optional `component` prop.
- **`flyo.isMultilingual()`** — `true` when more than one locale is configured.
- **`NitroLanguageLinks`** (`@flyo/nitro-next/server`) — renders nothing;
  publishes the given links on the server **and** the client. Rendered
  automatically by `NitroPage` / `nitroEntityRoute`; only custom routes render
  it by hand (it replaces v2.2's `publishLanguageLinks()` call).
- **`useLanguageLinks(initial?)`** (`@flyo/nitro-next/client`) — advanced: the
  hook behind the switcher, for fully custom client switchers (e.g. a dropdown
  with its own state).

## What to do

### If your site is single-language, or you have no switcher

Nothing.

### Replace your v2.2 switcher with `NitroLanguageSwitcher`

Delete the v2.2 `readLanguageLinks()` switcher component, and drop the built-in
one into your root layout — the `<Suspense>` wrapper is no longer needed either
(it's built in):

```diff
  // app/layout.tsx
- import { Suspense } from 'react';
- import { LanguageSwitcher } from '@/components/LanguageSwitcher';
+ import { NitroLanguageSwitcher } from '@flyo/nitro-next/server';
+ import { flyo } from '@/flyo.config';

  export default async function RootLayout({ children }) {
    // …
    return (
      <html lang={lang}>
        <body>
          {children}
          <footer>
-           <Suspense fallback={null}>
-             <LanguageSwitcher />
-           </Suspense>
+           <NitroLanguageSwitcher
+             default={[
+               { shortcode: 'de', name: 'Deutsch', href: '/' },
+               { shortcode: 'en', name: 'English', href: '/en' },
+             ]}
+           />
          </footer>
        </body>
      </html>
    );
  }
```

`default` is the switcher definition: the array order is the display order and
`name` is the label — always used as given. The active route's published links
contribute only the **hrefs** (and the current-locale flag): a locale the route
has a translation for links there; a locale it doesn't links to its default
`href` (typically that language's home page). A route that publishes nothing at
all renders the defaults verbatim.

With no `component` prop it renders minimal semantic markup you can style with
CSS — `nav[aria-label="Language"] > ul > li > a`, with `aria-current` on the
active locale.

### Custom markup: pass a `component`

Want your own markup? Write **one client component** that receives the links as
a plain prop — no hooks, no async, no store:

```tsx
// components/language-switcher.tsx — the ONE file you write
'use client';

import type { FlyoLanguageLink } from '@flyo/nitro-next/client';

export function LanguageSwitcher({ links }: { links: FlyoLanguageLink[] }) {
  return (
    <nav aria-label="Language">
      {links.map((l) => (
        // Native <a>, NOT next/link — a language switch must reload the shared chrome.
        <a key={l.shortcode} href={l.href!} aria-current={l.isCurrent ? 'true' : undefined}>
          {l.name}
        </a>
      ))}
    </nav>
  );
}
```

```tsx
// app/layout.tsx
<NitroLanguageSwitcher default={/* as above */} component={LanguageSwitcher} />
```

The component receives the already-merged links — your `default` order and
labels, the route's hrefs. (`l.exists` tells you whether the href is a real
translation or the default, if you want to style that differently.)

One rule, enforced with a clear error if broken: the component must be a
**client component** — exported from a `'use client'` file and passed by
reference (an inline arrow function in the server layout is not serializable
across the server/client boundary). Being a client component is also what
makes the live updates work: the root layout never re-renders on soft
navigation, so only a client component can update there.

### Custom routes: replace the `publishLanguageLinks()` call with `<NitroLanguageLinks />`

`publishLanguageLinks()` is **removed** (it only fed the server half, which is
exactly the v2.2 bug). Render the `NitroLanguageLinks` component instead — it
feeds both halves:

```diff
- import { publishLanguageLinks } from '@flyo/nitro-next/server';
+ import { NitroLanguageLinks } from '@flyo/nitro-next/server';
  import { flyo } from '@/flyo.config';

  export default async function GalleryPage() {
    const currentLang = await flyo.getRequestLocale();
-   publishLanguageLinks([
-     { shortcode: 'de', name: 'Deutsch', href: '/de/galerie', isCurrent: currentLang === 'de', exists: true },
-     { shortcode: 'en', name: 'English', href: '/en/gallery', isCurrent: currentLang === 'en', exists: true },
-   ]);
-   return /* … */;
+   return (
+     <>
+       <NitroLanguageLinks
+         links={[
+           { shortcode: 'de', name: 'Deutsch', href: '/de/galerie', isCurrent: currentLang === 'de', exists: true },
+           { shortcode: 'en', name: 'English', href: '/en/gallery', isCurrent: currentLang === 'en', exists: true },
+         ]}
+       />
+       {/* … page content … */}
+     </>
+   );
  }
```

If a custom route publishes nothing, the switcher simply renders your `default`
entries — after a soft navigation immediately; on a full page load after a 5 s
safety timeout plus a console warning pointing at the fix (the timeout exists
so a forgotten publish can never hang a request or a build).

(As in v2.2: never publish from `not-found.tsx` — the route helpers already
settle the store before every `notFound()`.)

## API changes in v2.3

Added:

| Added | Where | Description |
|-------|-------|-------------|
| `NitroLanguageSwitcher` | `/server` | The complete switcher for shared chrome: SSR-correct, live across soft navigations. Required `default` prop defines locales, order and labels; optional `component` for custom markup. |
| `NitroLanguageLinks` | `/server` | Publish links for the current route on server **and** client (renders nothing). Automatic via `NitroPage` / `nitroEntityRoute`; render by hand on custom routes. |
| `FlyoSwitcherLocale` | `/server` + `/client` | Type of one `default` entry: `{ shortcode, name, href }`. |
| `flyo.isMultilingual()` | instance | `true` only with more than one configured locale. |
| `useLanguageLinks(initial?)` | `/client` | Advanced: subscribe your own client switcher to the active route's raw published links. |
| `NitroLanguageLinksPublisher` | `/client` | Internal client publisher behind `NitroLanguageLinks`. |
| `NitroLanguageSwitcherClient` | `/client` | Internal client half behind `NitroLanguageSwitcher`. |

Removed (v2.2 had no adoption; the replacements cover every use):

| Removed | Replacement |
|---------|-------------|
| `readLanguageLinks()` | `<NitroLanguageSwitcher />` in the layout |
| `publishLanguageLinks(links)` | `<NitroLanguageLinks links={links} />` on custom routes |
| `createLanguageLinksStore()` / `LanguageLinksStore` | internal |

Behavioral changes:

- **One degradation everywhere — your `default` entries.** A locale the route
  has no translation for links to its default href; a route that publishes
  nothing at all (a 404, a custom route without `NitroLanguageLinks`) renders
  the defaults verbatim. v2.2's disabled entries and empty-switcher states are
  gone.
- On multilingual sites, `NitroPage` and `nitroEntityRoute` additionally render
  the invisible client publisher (no visible markup, no layout impact).
- The switcher's server side settles after at most 5 s (plus a console warning)
  when nothing publishes — rendering the defaults — instead of waiting forever.
  (In v2.2 a route that forgot to publish could hang a request — or even a
  static build, e.g. the standalone prerender of `/_not-found`.)

---

# Upgrading from v2.1 to v2.2

> ⚠️ **The switcher pattern introduced in v2.2 turned out to be incomplete:**
> it goes stale after soft (client-side) navigation, because the App Router
> never re-renders the root layout on `<Link>` navigations. **v2.3 fixes this**
> — read this section for the concepts, then apply the
> [v2.2 → v2.3 migration](#upgrading-from-v22-to-v23) above.

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

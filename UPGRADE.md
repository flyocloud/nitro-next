# Upgrading to v3.0.1

**The Flyo TypeScript SDK moves to `^2.0.0`.** That is the whole reason this is a
major: the sitemap endpoint got a response model of its own, which can break a
build. Everything `@flyo/nitro-next` itself gives you keeps working, and one new
capability comes with it: **draft links**, served uncached at every layer.

```bash
npm install @flyo/nitro-next@^3.0.1
```

`@flyo/nitro-typescript` is a dependency of this package, so the upgrade pulls it
in for you. If your project imports the SDK directly (for `Entity`, `Block`,
`Page` types), bump your own dependency to `^2.0.0` as well — a `^1.x` range
never resolves to `2.0`.

## What changed

### 1. `sitemap()` returns its own model (breaking, if you read it yourself)

Up to SDK v1.7 the sitemap endpoint reused the entity/search model. It now has a
schema of its own, `SitemapinterfaceInner`, describing what the endpoint actually
delivers:

| Method | v1.7 | v2.0 |
|--------|------|------|
| `SitemapApi.sitemap()` | `Promise<Array<EntityinterfaceInner>>` | `Promise<Array<SitemapinterfaceInner>>` |
| `SitemapApi.sitemapRaw()` | `Promise<ApiResponse<Array<EntityinterfaceInner>>>` | `Promise<ApiResponse<Array<SitemapinterfaceInner>>>` |

Five properties are gone from a sitemap item — `entity_title`, `entity_teaser`,
`entity_image`, `entity_time_start` and `entity_type_id`. What is left is exactly
what a sitemap needs: `href`, `updated_at` and `entity_unique_id`.

**`flyo.sitemap()` is unaffected** — it only ever read `href` and `updated_at`,
and still returns `MetadataRoute.Sitemap`. Nothing to do if that is all you use.

⚠️ **If you call `flyo.getNitroSitemap().sitemap()` yourself**, audit every read
of the result for those five fields. They now come from `SearchApi.search()` or
`EntitiesApi`:

```diff
- const items = await flyo.getNitroSitemap().sitemap({});
- items.map(i => ({ title: i.entity_title, href: i.href }));
+ // Titles, teasers and images live on the search/entities models now
+ const items = await flyo.getNitroSearch().search({ query });
+ items.map(i => ({ title: i.entity_title, href: i.href }));
```

⚠️ **The compiler will not always catch this.** Every property on both models is
optional, so `SitemapinterfaceInner` is still structurally assignable to
`EntityinterfaceInner` — an explicit annotation keeps compiling while the dropped
fields silently read `undefined` at runtime:

```diff
- const items: EntityinterfaceInner[] = await flyo.getNitroSitemap().sitemap({});
+ const items = await flyo.getNitroSitemap().sitemap({});
  items.map(i => i.entity_title); // now an error, as it should be
```

Drop the annotation and let the type checker find the reads for you.

`entity_type`, `entity_slug` and `routes` are still delivered and still typed as
before, but marked `@deprecated`: `href` is the resolved URL for both container
pages and mapped entities, and the endpoint omits entries that have no resolvable
URL at all. Nothing breaks today; migrate URL assembly to `href` before the next
major spec bump.

`SearchApi.search()` still returns `EntityinterfaceInner[]` — that model is
unchanged and not deprecated. Only the sitemap moved off it.

### 2. Draft links, uncached at every layer (new)

A **draft link** is a shareable, expiring snapshot of an entity that is still
*offline* in Flyo — the only way such content can be looked at on the website at
all. Flyo hands out a link whose opaque token takes the place of the slug or the
unique id, so it arrives at the entity route you already have, and the response
carries two new fields: `is_draft` and `draft_expires_at`.

Draft content must not be stored where a second visitor could be served from, and
must not linger in a browser after the link has expired. So a draft response is
now served with caching off — **browser, CDN and Next.js alike**:

```
GET /blog/<token>                → 307 /blog/<token>?flyo-draft=1
GET /blog/<token>?flyo-draft=1   → 200  Cache-Control: no-store
                                        CDN-Cache-Control: no-store
                                        Vercel-CDN-Cache-Control: no-store
```

The redirect is what makes that possible: `is_draft` is only known *after* the
API has answered, half-way through the render, and a Server Component cannot set
response headers — Next.js only fills in a `Cache-Control` the proxy has not
already written. So the render bounces the request once onto a marked URL, and
the proxy recognises the marker on the second pass. Reading the marker also marks
the render dynamic, which keeps the draft out of Next's own Full Route Cache.

**Nothing to configure** — this works as long as `createProxy()` covers the
route. Worth knowing:

- The marker only ever affects the URL that carries it. `?flyo-draft=1` is a
  separate cache key from the clean URL, so appending it by hand does not disable
  caching for your visitors — it bypasses the cache for that one URL variant,
  exactly like any other unknown query parameter already does.
- Rename it with `initNitro({ draftUrlMarker: 'preview' })`, or switch the
  redirect off with `draftUrlMarker: false` (drafts then still skip Next's render
  cache, but browser and CDN cache them like any other page).
- Draft URLs reaching your site in another shape? `createProxy(flyo, {
  isDraftRequest: (req) => … })` replaces the detection.

### 3. The draft banner (new)

`nitroEntityRoute` renders a `NitroDraftNotice` above your content whenever the
response is a draft, so a reviewer can tell a preview from the live page:

> Draft preview — this content is not published · link expires 2034-01-01 00:00 UTC

It renders nothing for published entities, so existing pages are untouched. Pass
`draftNotice: false` to place or style it yourself with the exported
`<NitroDraftNotice entity={entity} />`.

## What to do

### 1. Bump the dependency

```bash
npm install @flyo/nitro-next@^3.0.1
```

If your project imports `@flyo/nitro-typescript` directly, bump it to `^2.0.0`
too, then build.

### 2. Audit your own sitemap reads

Only if you call `flyo.getNitroSitemap().sitemap()` — see
[§1](#1-sitemap-returns-its-own-model-breaking-if-you-read-it-yourself). Remove any
`EntityinterfaceInner` annotation on that result first, so the compiler can point
at the reads that need moving to `/search` or `/entities`.

### 3. Let draft tokens reach the API

Your resolver itself needs no change: a draft token goes through the same
`entityBySlug()` / `entityByUniqueid()` call as any other entity, and the `typeId`
filter does not apply to a token, so a type-filtered route resolves draft links
just as it resolves published ones.

What does silently 404 a draft link is a router that gates the parameter:

```diff
  const resolver: EntityResolver<{ slug: string }> = async (params) => {
    const { slug } = await params;
-   if (!/^[a-z0-9-]+$/.test(slug)) notFound();   // rejects the token
    return flyo.getNitroEntities().entityBySlug({ slug, typeId: 123 });
  };
```

A `generateStaticParams` with `dynamicParams = false` on an entity route does the
same thing — a draft token is never in the pre-rendered list.

### 4. Keep the proxy in front of your entity routes

The draft cache headers come from `createProxy()`. If your matcher excludes the
routes that serve entities, drafts still render and still skip Next's render
cache, but the browser and CDN will cache them.

## API changes in v3.0

| | |
|---|---|
| `initNitro({ draftUrlMarker })` | **New.** Query parameter draft links are marked with. Default `'flyo-draft'`, `false` to switch the redirect off |
| `flyo.state.draftUrlMarker` | **New.** `string \| null` — the resolved marker |
| `createProxy(flyo, options?)` | **Changed.** Takes `isDraftRequest` to override draft detection; answers draft requests with `no-store` |
| `nitroEntityRoute(flyo, options)` | **Changed.** Takes `draftNotice` (default `true`) |
| `NitroDraftNotice` | **New.** Server component rendering the draft banner |
| `Entity.is_draft`, `Entity.draft_expires_at` | **New**, from SDK v2 |
| `SitemapApi.sitemap()` | **Breaking**, from SDK v2 — returns `SitemapinterfaceInner[]` |
| `flyo.sitemap()` | Unchanged |

---

# Upgrading to v2.10.0

**`FlyoMetric` gained an `enabled` prop, and `isProd` is deprecated.** Nothing
breaks on update, but there is one line to add per entity route:

```bash
npm install @flyo/nitro-next@^2.10.0
```

## What changed

`FlyoMetric` used to gate its tracking request on `isProd`, i.e.
`process.env.NODE_ENV === 'production'`. That cannot tell the live site from a
preview deployment: **every hosting platform builds pull-request previews, branch
and staging deploys with `NODE_ENV=production`**, so on Vercel every deployment
counted towards the entity statistics — previews and editor sessions included.

The deployment is known in your route file, which is a server component, so the
component now takes the answer as a prop instead of guessing:

```tsx
export function FlyoMetric({ entity, enabled = true }: { entity: Entity; enabled?: boolean })
```

`enabled` defaults to `true`, so an untouched `<FlyoMetric entity={entity} />`
keeps sending — including from local development, where the old `NODE_ENV` check
used to stop it. Pass the flag to get the behaviour you want.

## What to do

### 1. Pass `enabled` in your entity routes

`flyo.state.liveEdit` is the switch you already configured in `initNitro()`. In
the usual setup it is on for local development, editor previews and any
deployment the editor points at — exactly the views that shouldn't count:

```diff
  export default nitroEntityRoute(flyo, {
    resolver,
    render: (entity: Entity) => (
      <>
-       <FlyoMetric entity={entity} />
+       <FlyoMetric entity={entity} enabled={!flyo.state.liveEdit} />
        <article>
          <h1>{entity.entity?.entity_title}</h1>
        </article>
      </>
    )
  });
```

To exclude preview deployments that do *not* run live editing, add your
platform's marker — on Vercel `NEXT_PUBLIC_VERCEL_ENV` is exposed automatically:

```tsx
const isLive = !flyo.state.liveEdit && process.env.NEXT_PUBLIC_VERCEL_ENV === 'production';

<FlyoMetric entity={entity} enabled={isLive} />
```

### 2. Replace `isProd`

`isProd` still exists and still equals `process.env.NODE_ENV === 'production'`,
but it is marked `@deprecated` (your IDE will strike it through) and will be
removed in a future major. It was never able to answer "is this the live site?".

If you used it to gate analytics or a tracking pixel, move the decision into the
server component that renders it:

```diff
  // components/Analytics.tsx
- 'use client';
- import { isProd } from '@flyo/nitro-next/client';
  import Script from 'next/script';

  export function Analytics() {
-   if (!isProd) return null;
    return <Script defer data-domain="example.com" src="https://plausible.io/js/script.js" />;
  }
```

```diff
  // app/layout.tsx
+ import { flyo } from '@/flyo.config';
+
+ const isLive =
+   !flyo.state.liveEdit && process.env.NEXT_PUBLIC_VERCEL_ENV === 'production';
+
  // …inside <body>
- <Analytics />
+ {isLive && <Analytics />}
```

Any variable works in a server component; a check inside a `'use client'`
component needs a `NEXT_PUBLIC_` prefixed one, because only those are inlined
into the browser bundle.

See [Production-only Code](README.md#15-production-only-code-metrics-analytics)
in the README for the full picture.

---

# Upgrading to v2.9.0

**Every page now gets a canonical URL.** Update the package — there is nothing to
change in your code:

```bash
npm install @flyo/nitro-next@^2.9.0
```

## What changed

`nitroPageGenerateMetadata` emitted a canonical only as a side effect of building
the hreflang links: the canonical came from the `translation[]` entry matching the
locale being rendered, so a **single-language site — where `translation[]` is
empty — got no `<link rel="canonical">` at all**, and a multilingual page whose
translations were missing its own locale got none either.

The pages endpoint resolves every page's final URL into `page.href` (`/about-me`),
which is exactly the self-referencing canonical those pages were missing. It is
now used whenever the translations don't produce one:

```html
<!-- v2.8.3, single-language site -->
<title>About me</title>
<meta name="description" content="Field notes">

<!-- v2.9.0 -->
<title>About me</title>
<meta name="description" content="Field notes">
<link rel="canonical" href="https://yourdomain.com/about-me">
```

Nothing else about the metadata changed: the title, description, Open Graph and
Twitter tags are untouched, and on a multilingual page the canonical still comes
from the active locale's translation — `page.href` is only the fallback.

Pages whose Flyo `type` is a link target rather than a document (`email`, `tel`,
`file`) carry a `mailto:` / `tel:` / download `href`, which can never be a
canonical — those get none, as before.

## ⚠️ Check your `baseUrl`

Canonical and hreflang URLs are now prefixed with the `baseUrl` from
`initNitro()`, which makes them fully qualified — what search engines expect for
hreflang — and identical to the URLs `flyo.sitemap()` emits for the same content:

```diff
- <link rel="alternate" hreflang="de" href="/de/ueber-uns">
+ <link rel="alternate" hreflang="de" href="https://yourdomain.com/de/ueber-uns">
```

Without a `baseUrl` the library keeps emitting the bare path and Next.js resolves
it against [`metadataBase`](https://nextjs.org/docs/app/api-reference/functions/generate-metadata#metadatabase),
**which defaults to `http://localhost:3000`** — a production build would then
advertise `<link rel="canonical" href="http://localhost:3000/about-me">`. If you
followed the README your `flyo.config.tsx` already reads it from the environment
(`flyo.sitemap()` throws without it), so this is only worth a look if you skipped
the sitemap:

```tsx
export const flyo = initNitro({
  accessToken: process.env.FLYO_ACCESS_TOKEN || '',
  baseUrl: process.env.SITE_URL || 'http://localhost:3000',
  // ...
});
```

Verify with `curl -s https://your-site.test/about-me | grep canonical`.

## Overriding the canonical

Wrap the factory and spread its result — the same pattern as any other field:

```tsx
const nitroMetadata = nitroPageGenerateMetadata(flyo);

export async function generateMetadata(props: { params: Promise<{ slug?: string[] }> }) {
  const metadata = await nitroMetadata(props);
  return {
    ...metadata,
    alternates: { ...metadata.alternates, canonical: 'https://yourdomain.com/somewhere-else' },
  };
}
```

## Entity detail pages

Unchanged. The entities endpoint carries no `href`, so an entity's canonical
still comes from its `translation[]` only — an entity without translations gets
none. Set it yourself in that case, with the wrapper above.

---

# Upgrading to v2.8.3

**A dependency bump with no API change.** Update the package — there is nothing
to change in your code:

```bash
npm install @flyo/nitro-next@^2.8.3
```

v2.8.3 raises the dependency floor to `@flyo/nitro-typescript@^1.7.0`, which
regenerates the SDK against OpenAPI document 2.30 (was 2.28.1). No endpoint,
parameter, or method signature changed, and this library's own surface is
untouched — every export, prop, and helper behaves exactly as in v2.8.2.

Two SDK types did change. They matter only if you touch the SDK's own models —
either by importing from `@flyo/nitro-typescript` directly, or through the raw
API accessors (`flyo.getNitroSitemap()`, `getNitroEntities()`, `getNitroPages()`,
`getNitroSearch()`), which hand you the generated types unchanged:

- **The `Routes` type is gone.** 2.30 inlines the schema, so the generator no
  longer emits it. `Routes`, `RoutesFromJSON`, `RoutesToJSON`, and
  `instanceOfRoutes` no longer exist. Replace a `Routes` annotation with the
  inline type — the value it described is unchanged:

  ```diff
  - import type { Routes } from '@flyo/nitro-typescript';
  - function firstRoute(routes: Routes) { … }
  + function firstRoute(routes: { [key: string]: any }) { … }
  ```

- **`routes` is now `{ [key: string]: any }`** on both `EntityInterface` and
  `EntityinterfaceInner`. On `EntityInterface` it used to be a map of *strings*,
  which was wrong: the map always carries a boolean `_empty` alongside the URL
  paths. Reading a path (`routes.detail`) still type-checks and still returns a
  string, but you lose `string` inference on the values, so add a guard where the
  key is dynamic:

  ```ts
  const path = routes[key];
  if (typeof path !== 'string') return undefined;
  ```

  One runtime difference: an explicit `"_empty": null` from the API is now
  preserved instead of being coerced to `undefined`. Use `routes._empty == null`
  if you need to treat both alike.

`@flyo/nitro-next` itself reads none of this. Sitemap URLs have come from the
item's `href` since v2.6.0 (see "If you relied on the old route/slug fallback"
below), so the library never touches `routes` and never re-exported `Routes`.
Details in the [SDK upgrade guide](https://github.com/flyocloud/nitro-typescript-sdk/blob/main/UPGRADE.md).

---

# Upgrading to v2.8.2

**Fixes missing `og:image` and `twitter:image`.** Update the package — there is
nothing to change in your code:

```bash
npm install @flyo/nitro-next@^2.8.2
```

The cause was in a dependency, not in this library. `@flyo/nitro-typescript@1.5.0`
discarded `meta_json.image` while deserializing the pages response: the field is
declared in the OpenAPI spec as `oneOf: [string, boolean]` (a URL when a meta
image is set, `false` when it is not), and the generator that produced 1.5.0 had
no code path for a `oneOf` of primitives, so every image URL arrived as an empty
object. `buildSocialImageUrl()` correctly rejected the non-string and skipped the
tags, so pages rendered a complete `<head>` — title, description, canonical,
hreflang, `og:title`, `og:description` — with both image tags silently absent.

v2.8.2 raises the dependency floor to `@flyo/nitro-typescript@^1.6.0`, which
deserializes the field correctly. If you pin `@flyo/nitro-typescript` yourself,
raise it too — a `^1.4.0` or `^1.5.0` range resolves to the broken 1.5.0. Details
in the [SDK upgrade guide](https://github.com/flyocloud/nitro-typescript-sdk/blob/main/UPGRADE.md).

Verify with `curl -s https://your-site.test | grep 'og:image'` — a page whose
`meta_json.image` is set in Flyo should now emit
`<meta property="og:image" content="…?w=1200&h=630&format=jpg">`.

---

# Upgrading from v2.7 to v2.8

> This guide is written for both humans and AI coding agents. Steps are explicit
> enough to follow by hand and precise enough to apply programmatically.

## Overview

v2.8 makes schema.org structured data automatic. **There is nothing you must
do** — no export was removed, no signature changed.

Flyo delivers a JSON-LD document with both content types: `page.jsonld` on the
pages endpoint (typically a `WebPage`) and `entity.jsonld` on the entities
endpoint. Until now the library could only render the entity one, and only if
you wired `<NitroEntityJsonLd />` into your entity route by hand — the page
document had no component at all, so page-level structured data never reached
the HTML.

Now:

- **`NitroPage` renders `page.jsonld`** — so `nitroPageRoute` and every route
  rendering `<NitroPage>` emit the page's document.
- **`nitroEntityRoute` renders `entity.jsonld`** — so entity detail routes emit
  the entity's document without a component in `render`.

## What to do

### Optional: drop the manual `<NitroEntityJsonLd />`

If your entity routes render it themselves, the line is now redundant. It stays
**harmless** if you leave it — the same document is never emitted twice in one
request — but you can clean it up:

```diff
  import {
    nitroEntityRoute,
    nitroEntityGenerateMetadata,
-   NitroEntityJsonLd,
    type EntityResolver
  } from '@flyo/nitro-next/server';

  export default nitroEntityRoute(flyo, {
    resolver,
    render: (entity) => (
      <>
-       <NitroEntityJsonLd entity={entity} />
        <FlyoMetric entity={entity} />
        <h1>{entity.entity?.entity_title}</h1>
      </>
    ),
  });
```

### Check the document in Flyo, not in your code

If a page or entity emits no `<script type="application/ld+json">`, its document
is empty in Flyo. The API sends `{}` (pages) / `[]` (entities) when none is
maintained, and neither is rendered — an empty `{}` script would only confuse
crawlers.

## What changed

### Empty documents no longer render

`NitroEntityJsonLd` used to test `if (!entity.jsonld)`, which never fired: the
entities endpoint sends `[]` — truthy — when no document is set. In practice
that only mattered once emission became automatic, but the check is now a real
emptiness test (empty object, empty array, blank string), so no page ships an
empty JSON-LD script.

### A document is emitted at most once per request

Identical documents are collapsed, which is what makes a leftover
`<NitroEntityJsonLd />` harmless. Documents that *differ* are all emitted, so
structured data you add yourself is never suppressed.

## API changes in v2.8

Additive only:

| Export | What it does |
|--------|--------------|
| `NitroPageJsonLd` | Renders a page's `jsonld` document. Rendered by `NitroPage` automatically; use it in custom page routes that don't render `NitroPage`. |
| `NitroJsonLd` | Renders any JSON-LD document you supply — for structured data of your own (`BreadcrumbList`, `Organization`, …). |

Behavioral changes:

| Where | Before (v2.7) | After (v2.8) |
|-------|---------------|--------------|
| `page.jsonld` | never rendered | rendered by `NitroPage` |
| `entity.jsonld` | rendered only via a manual `<NitroEntityJsonLd />` | rendered by `nitroEntityRoute` |
| Empty `jsonld` (`{}` / `[]`) | would render `<script>{}</script>` | renders nothing |
| The same document rendered twice in one request | two `<script>` tags | one |

---

# Upgrading from v2.6 to v2.7

> This guide is written for both humans and AI coding agents. Steps are explicit
> enough to follow by hand and precise enough to apply programmatically.

## Overview

v2.7 changes the `lastmod` of every sitemap entry. **There is nothing to do** —
no export, signature or option changed, and `app/sitemap.ts` stays as it is.

The Flyo Nitro `/sitemap` endpoint now returns an `updated_at` Unix timestamp
per item: the last time the content behind that URL actually changed.
`flyo.sitemap()` uses it as the entry's `lastModified`, instead of stamping
every entry with the time the sitemap happened to be generated.

This requires `@flyo/nitro-typescript` **1.5.0** or newer, which is where the
generated client learned about `updated_at`. It ships as a dependency of
`@flyo/nitro-next`, so `npm install @flyo/nitro-next@^2.7.0` pulls it in — but
if your project depends on the client directly, bump it there too.

## What changed

### `lastmod` now reflects the content, not the build

Before, every entry carried `lastModified: new Date()`. Because `sitemap.ts` is
an ISR route (see [v2.6](#upgrading-from-v25-to-v26)), that meant *every* URL
claimed to have changed on *every* regeneration — hourly, with the recommended
`revalidate = 3600`. Google discounts `lastmod` site-wide once it stops matching
reality, so the value was at best ignored and at worst harmful.

Now the timestamp comes from the item's `updated_at`, so only URLs whose content
really changed move their `lastmod`.

### Items without a timestamp have no `lastmod`

An entry whose `updated_at` is missing, zero or not a number is emitted as
`{ url }` with **no** `lastModified` key. `lastmod` is optional in the sitemap
protocol, and omitting it is the honest answer — the previous "now" was not.

If your own code post-processes `flyo.sitemap()` output, note that
`entry.lastModified` can now be `undefined`:

```diff
- const changed = entry.lastModified.toISOString();
+ const changed = entry.lastModified?.toISOString();
```

### A page without a meta image no longer types as a string

Unrelated to the sitemap, but part of the same client bump: `meta_json.image` is
now typed `MetaImage` (`string | boolean`), because the API returns `false` — not
`''` — when a page has no meta image. The metadata helpers already handled that
value at runtime and are unchanged; only the type is more honest now. If your own
code reads `page.meta_json?.image`, narrow it before using it as a URL:

```diff
- const src = page.meta_json?.image ?? '';
+ const image = page.meta_json?.image;
+ const src = typeof image === 'string' ? image : '';
```

## API changes in v2.7

None. No export was added, removed or renamed, and no option changed its
meaning.

Behavioral changes:

| Where | Before (v2.6) | After (v2.7) |
|-------|---------------|--------------|
| `lastModified` of an entry | `new Date()` — the time the sitemap was generated | `item.updated_at`, the content's last change |
| Item without a usable `updated_at` | `new Date()` | no `lastModified` key at all |
| `@flyo/nitro-typescript` | `^1.2.0` | `^1.5.0` (first version carrying `updated_at`) |

---

# Upgrading from v2.5 to v2.6

> This guide is written for both humans and AI coding agents. Steps are explicit
> enough to follow by hand and precise enough to apply programmatically.

## Overview

v2.6 changes how `flyo.sitemap()` builds its URLs and adds one **required**
line to your `app/sitemap.ts`. The library API is unchanged — same export, same
signature, same return type.

1. **URLs now come from the API's `href`.** The Flyo Nitro `/sitemap` endpoint
   returns a resolved `href` for every item, so the library no longer stitches a
   path together from `routes` / `entity_slug`.
2. **Your `app/sitemap.ts` needs `export const revalidate`.** Without it Next.js
   renders the sitemap once at build time and never again.

## What to do

### Add `revalidate` to `app/sitemap.ts` — required

```diff
  import { flyo } from '@/flyo.config';

+ export const revalidate = 3600; // regenerate sitemap.xml at most hourly
+
  export default async function sitemap() {
    return flyo.sitemap();
  }
```

**Why.** A `sitemap.ts` with no dynamic API usage and no `revalidate` is a
**fully static** route: Next.js runs it once during `next build`, writes
`sitemap.xml` into the build output, and serves that file for the lifetime of
the deployment. On Vercel — and on any host serving the build output — pages and
entities published in Flyo *after* the deploy therefore **never** appear in the
sitemap until someone triggers a new build. Search engines keep crawling a
sitemap that is frozen at deploy time.

Exporting `revalidate` turns the route into an ISR route: the first request
after the window elapses regenerates `sitemap.xml` in the background from live
Flyo content. `3600` (hourly) is a good default — raise it for rarely-changing
sites, lower it for news-style content. `0` regenerates on every request, which
means a full sitemap fetch against the Flyo API per request; only use it if you
really need it.

This applies to any project on any v2 version — it is listed under v2.6 because
that is when it became documented, not because the behavior changed.

### If you relied on the old route/slug fallback

Nothing to do in normal projects, but the emitted URLs can differ, so re-check
`/sitemap.xml` after upgrading:

- URLs now come from `href`, which is the same path the CMS links to. Previously
  the library took the **first value** of the item's `routes` map and fell back
  to `entity_slug`.
- Items **without** an `href` are now **skipped**. Previously an item whose route
  could not be resolved produced a bare base URL, so an unrouted item silently
  added a duplicate homepage entry.
- `routes` gained a system `_empty` boolean. The old "first value of `routes`"
  logic could pick that boolean up and interpolate `false` into a URL — another
  reason the fallback is gone.
- An `href` that is already absolute (`https://…`) is emitted unchanged instead
  of being appended to `baseUrl`.

If your own code builds links from a sitemap or search result, switch it to
`href` for the same reasons:

```diff
- const path = Object.values(item.routes ?? {})[0] ?? item.entity_slug;
+ const path = item.href;
```

### Multilingual sites

The `/sitemap` endpoint returns **all** language variants of every page and
entity regardless of the `lang` parameter, so `flyo.sitemap()` now covers every
locale out of the box. If you previously generated one sitemap per locale by
hand, you can drop that workaround — and check for duplicates if you keep it.

## API changes in v2.6

None. No export was added, removed or renamed, and no option changed its
meaning.

Behavioral changes:

| Where | Before (v2.5) | After (v2.6) |
|-------|---------------|--------------|
| `flyo.sitemap()` URL path | first value of `item.routes`, else `item.entity_slug` | `item.href` |
| Item with no resolvable route | emitted as the bare `baseUrl` | skipped |
| Item with an absolute `href` | n/a (path was always appended) | emitted unchanged |

---

# Upgrading from v2.4 to v2.5

> This guide is written for both humans and AI coding agents. Steps are explicit
> enough to follow by hand and precise enough to apply programmatically.

## Overview

v2.5 migrates every generated image URL to the **new Flyo CDN URL format**
announced for **06.08.2026**. The API is unchanged — same loaders, same
options, same call sites. **If you only use `FlyoCdnLoader`, `FlyoCdnLoaderCrop`
and the built-in metadata helpers, there is nothing to do.**

**What changed.** Image transformations move from a path segment to query
parameters:

```diff
- https://storage.flyo.cloud/me.png/thumb/700x700?format=webp
+ https://storage.flyo.cloud/me.png?w=700&h=700&format=webp

- https://storage.flyo.cloud/me.png/thumb/700xnull?format=webp
+ https://storage.flyo.cloud/me.png?w=700&format=webp
```

**Why now.** The old `/filter/{w}x{h}` form — and every other
`{file}/{word}/{w}x{h}` variant — was **removed on 06.08.2026** and returns
**HTTP 404**. `/thumb/{w}x{h}` still works and is scheduled for removal no
earlier than **06.08.2028**, so this is a migration you can do calmly, but the
library no longer emits a deprecated URL.

## The new format

| URL | Result |
| --- | --- |
| `{file}` | original image |
| `{file}?w=300&h=300` | fixed size (crop, focal point applied) |
| `{file}?w=300` | height dynamic (aspect ratio preserved) |
| `{file}?h=300` | width dynamic |
| `{file}?w=300&h=300&format=webp` | convert format (`webp`, `jpg`, `jpeg`, `png`, `gif`) |
| `{file}?w=300&h=300&download=1` | deliver as a download |

Rules:

- `w` / `h` are positive integers without leading zeros.
- A dynamic side is expressed by **omitting** the parameter. `0`, an empty value
  and the literal `null` are **invalid** and answered with **HTTP 400** — so the
  old `nullx300` / `300xnull` spelling has no query-parameter equivalent, you
  just leave the parameter out.
- Values above `2560` are capped at `2560` by the CDN.
- `format` without `w` / `h` is ignored; the unmodified original is returned.
- The focal point only applies when **both** `w` and `h` are set — unchanged
  from v2.4, only the spelling is new.

## What to do

### If you only use the library's loaders and metadata helpers

Nothing. `FlyoCdnLoader`, `FlyoCdnLoaderCrop` and the Open Graph / Twitter image
URLs in `nitroPageGenerateMetadata` / `nitroEntityGenerateMetadata` emit the new
format automatically.

### If your project builds CDN URLs by hand

Search your codebase for `/thumb/` and `/filter/` (typically string templates
around a media field's `source`) and rewrite them:

| Old | New |
| --- | --- |
| `/thumb/{B}x{H}` | `?w={B}&h={H}` |
| `/thumb/{B}xnull` | `?w={B}` |
| `/thumb/nullx{H}` | `?h={H}` |
| `/filter/{B}x{H}` | `?w={B}&h={H}` — **fix this one first, it 404s today** |
| `/filter/thumb/{B}x{H}/{file}` | `{file}?w={B}&h={H}` — **also 404s today** |

```diff
- const og = `${image}/thumb/1200x630?format=jpg`;
+ const og = `${image}?w=1200&h=630&format=jpg`;
```

Watch the separator when the source URL may already carry a query string: use
`&` instead of `?` in that case (the library does this for you).

### If you assert on generated URLs in tests

Snapshot or string assertions on `…/thumb/…` need updating to the query form.
The rendered image is identical; only the URL changed.

## API changes in v2.5

None. No export was added, removed or renamed, and no option changed its
meaning.

Behavioral changes:

| Where | Before (v2.4) | After (v2.5) |
|-------|---------------|--------------|
| `FlyoCdnLoader` | `{src}/thumb/{width}xnull?format=webp` | `{src}?w={width}&format=webp` |
| `FlyoCdnLoaderCrop({ aspectRatio })` | `{src}/thumb/{width}x{height}?format={format}` | `{src}?w={width}&h={height}&format={format}` |
| `FlyoCdnLoaderCrop()` (no ratio) | `{src}/thumb/{width}xnull?format={format}` | `{src}?w={width}&format={format}` |
| `nitroPageGenerateMetadata` / `nitroEntityGenerateMetadata` | `{image}/thumb/1200x630?format=jpg` (og), `…/1200x600` (twitter) | `{image}?w=1200&h=630&format=jpg` (og), `…?w=1200&h=600&format=jpg` (twitter) |

Additionally, a `src` that already contains a query string is now appended to
with `&` instead of producing a second `?`, and widths/heights are always
emitted as positive integers (a sub-pixel result is floored at `1` rather than
sent as `0`, which the CDN rejects with an HTTP 400).

---

# Upgrading from v2.3 to v2.4

> This guide is written for both humans and AI coding agents. Steps are explicit
> enough to follow by hand and precise enough to apply programmatically.

## Overview

v2.4 is **purely additive**. `FlyoCdnLoader` is unchanged and keeps working
exactly as before — nothing breaks, and doing nothing is a valid upgrade.

What's new: **`FlyoCdnLoaderCrop`**, a second image loader for images that are
displayed in a **fixed aspect ratio**. It exists because the existing loader
cannot honour an asset's **focal point**.

**Why the focal point was being ignored.** `FlyoCdnLoader` requests a
ratio-preserving resize (`…/thumb/{width}xnull` in v2.4, `…?w={width}` since
v2.5). Flyo applies an asset's focus **only when a fixed aspect ratio is
requested** — a `250x250` crop uses the focus, a width-only resize does not
([Flyo asset docs](https://docs.flyo.cloud/doc/assets-images)). So every image ended up
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

  export function Avatar({ block }) {
    return (
      <Image
-       loader={FlyoCdnLoader}
+       loader={FlyoCdnLoaderCrop({ aspectRatio: 1 })}
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
generated `srcset`, so the request becomes `…?w=700&h=700&format=webp` (v2.4
emitted `…/thumb/700x700?format=webp`) — a real crop, focal point applied.

Call the factory inline. It is only invoked while `<Image>` renders, to build a
URL string; the same options produce the same `src` / `srcSet`, so there is
nothing to hoist into a `const` or a `useMemo`.

**One rule when applying this: match `aspectRatio` to the CSS, not to the
asset.** If the frame is `aspect-video`, pass `16 / 9`. A mismatch means the
browser crops the already-cropped image a second time.

### Pass `maxWidth` when the source width is known

The CDN returns the **untouched original** for any request wider than the stored
asset — `…?w=1400&h=1400` on a 679×498 asset returns 679×498, uncropped, focus
ignored. `next/image` generates `srcset` candidates well beyond the rendered
size, so the crop can survive at small widths and vanish at large ones. If the
Flyo media field exposes the original dimensions, pass them:

```tsx
<Image
  loader={FlyoCdnLoaderCrop({ aspectRatio: 16 / 9, maxWidth: block.content.image.width })}
  src={block.content.image.source}
  alt={block.content.image.caption}
  width={1600}
  height={900}
/>
```

Without `maxWidth` the requested width is passed through untouched and the CDN
applies its own limits.

### If the project wraps `<Image>` in its own component

Projects generated from `ai-instructions-nextjs.md` usually have a
`components/flyo/FlyoImage.tsx`. Extend it with an optional `aspectRatio` (and
`maxWidth`) prop instead of touching every call site:

```tsx
'use client';

import Image, { type ImageProps } from 'next/image';
import { FlyoCdnLoader, FlyoCdnLoaderCrop } from '@flyo/nitro-next/client';

type FlyoImageProps = Omit<ImageProps, 'loader'> & {
  aspectRatio?: number;
  maxWidth?: number;
};

export function FlyoImage({ aspectRatio, maxWidth, ...props }: FlyoImageProps) {
  return (
    <Image
      loader={aspectRatio ? FlyoCdnLoaderCrop({ aspectRatio, maxWidth }) : FlyoCdnLoader}
      {...props}
    />
  );
}
```

Then the per-image change is `aspectRatio={16 / 9}` on the usages that render
into a fixed frame.

## API changes in v2.4

Added:

| Added | Where | Description |
|-------|-------|-------------|
| `FlyoCdnLoaderCrop(options?)` | `/client` (+ root) | Factory returning a `next/image` loader that requests a fixed width **and** height, so the CDN crops for real and applies the asset's focal point. |
| `FlyoCdnLoaderCropOptions` | `/client` (+ root) | `{ aspectRatio?: number; format?: string; maxWidth?: number }`. |

Options:

| Option | Default | Description |
|--------|---------|-------------|
| `aspectRatio` | – | `width / height`. Omitted → ratio-preserving width-only resize, identical to `FlyoCdnLoader`. |
| `format` | `'webp'` | Output format passed to the CDN. |
| `maxWidth` | – | Optional upper bound for the requested width. Unset → passed through; the CDN applies its own limits. |

Nothing removed, nothing renamed, no behavioral change to existing code:

- `FlyoCdnLoader` still emits a width-only, ratio-preserving resize and is still
  the right loader for images rendered at their natural ratio.
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

export const revalidate = 3600; // regenerate sitemap.xml at most hourly

export default async function sitemap() {
  return flyo.sitemap();
}
```

Add the `revalidate` export even if your v1 file did not have one — see
[Upgrading from v2.5 to v2.6](#upgrading-from-v25-to-v26) for why a sitemap
without it is generated once at build time and then never again.

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

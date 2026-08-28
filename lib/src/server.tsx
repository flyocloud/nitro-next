import { cache, Suspense } from 'react';
import type { Metadata, MetadataRoute } from 'next';
import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import {
  Page,
  Block,
  Entity,
  ConfigApi,
  ConfigResponse,
  Configuration,
  PagesApi,
  EntitiesApi,
  SitemapApi,
  SearchApi,
  type MetaImage,
  type Translation
} from '@flyo/nitro-typescript';

// The client half of the language-switcher bridge. Imported via the package's
// own `/client` entry (not `./client`) so bundlers resolve it to the built
// client module with its `"use client"` directive intact — a relative import
// would get inlined into the server bundle and lose the client boundary.
import { NitroLanguageLinksPublisher, NitroLanguageSwitcherClient } from '@flyo/nitro-next/client';

// Re-export the framework-agnostic language-links helper + types so they are
// available from `@flyo/nitro-next/server` alongside the rest of the server API.
// (Also imported locally below, for the request-scoped switcher store.)
import { getLanguageLinks, type FlyoLanguageLink, type FlyoSwitcherLocale } from './i18n';
export { getLanguageLinks };
export type { FlyoLanguageLink, FlyoSwitcherLocale };
export type { Translation } from '@flyo/nitro-typescript';

// Draft links. The constants are shared with `proxy.ts`, which cannot import
// from this module without dragging the whole server bundle into the edge
// runtime — see the notes in `draft.ts`.
import {
  DEFAULT_DRAFT_URL_MARKER,
  DRAFT_PATH_HEADER,
  DRAFT_REQUEST_HEADER,
  withDraftMarker,
} from './draft';

/**
 * Read-only configuration state
 */
export interface NitroState {
  readonly accessToken: string;
  /** The single default language (back-compat). Prefer `defaultLocale` for i18n. */
  readonly lang: string | null;
  /** All locale shortcodes the site supports, e.g. `['de', 'en']`. Empty for single-language setups. */
  readonly locales: string[];
  /** The primary/default locale (no URL prefix). Matches `config.nitro.primary_language`. */
  readonly defaultLocale: string | null;
  readonly baseUrl: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly components: Record<string, any>;
  readonly showMissingComponentAlert: boolean;
  readonly liveEdit: boolean;
  readonly serverCacheTtl: number;
  readonly clientCacheTtl: number;
  /**
   * Query parameter a draft URL is marked with so {@link createProxy} can send
   * `no-store` for it, or `null` when draft URL marking is switched off. See
   * `draftUrlMarker` on {@link initNitro}.
   */
  readonly draftUrlMarker: string | null;
}

/**
 * Route params type for Next.js catch-all routes
 */
type RouteParams = {
  params: Promise<{ slug?: string[] }>;
};

/**
 * Generic route params type for entity routes
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EntityRouteParams<T = any> = {
  params: Promise<T>;
};

/**
 * Entity resolver function type
 * Users provide this to resolve entities from their route params
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EntityResolver<T = any> = (params: Promise<T>) => Promise<Entity>;

/**
 * The Flyo instance returned by initNitro().
 * Carries all API access methods and configuration state.
 */
export interface FlyoInstance {
  /** Read-only configuration state */
  readonly state: NitroState;
  /**
   * Fetch and cache the Nitro CMS configuration (React-cached per requested locale).
   * When `lang` is omitted, the active request locale is used (from the `x-flyo-locale`
   * header set by the proxy), falling back to `defaultLocale`.
   */
  getNitroConfig(lang?: string): Promise<ConfigResponse>;
  /** Create a PagesApi client */
  getNitroPages(): PagesApi;
  /** Create an EntitiesApi client */
  getNitroEntities(): EntitiesApi;
  /** Create a SitemapApi client */
  getNitroSitemap(): SitemapApi;
  /** Create a SearchApi client */
  getNitroSearch(): SearchApi;
  /**
   * Resolve the active request locale from the `x-flyo-locale` header (set by the
   * proxy middleware), falling back to `defaultLocale`. Use it inside entity
   * resolvers or to set `<html lang>`.
   */
  getRequestLocale(): Promise<string | undefined>;
  /**
   * `true` when the site is configured with more than one locale. On
   * single-language sites the route helpers publish an empty language-links
   * list (so a mounted `NitroLanguageSwitcher` renders nothing) and skip the
   * client-side publisher entirely.
   */
  isMultilingual(): boolean;
  /** Resolve a page from catch-all route params (React-cached per request) */
  pageResolveRoute(props: RouteParams): Promise<{ page: Page; path: string; lang: string | undefined; cfg: ConfigResponse }>;
  /** Generate a Next.js sitemap from Flyo Nitro content */
  sitemap(): Promise<MetadataRoute.Sitemap>;
}

/**
 * Derive the active locale from a locale-prefixed path (`de/erleben` → `de`):
 * the first segment when it is a configured locale, the default locale
 * otherwise. Mirrors the proxy's URL detection, without touching `headers()` —
 * so it also works at build time (`generateStaticParams`).
 */
function deriveLangFromPath(path: string | undefined, state: NitroState): string | undefined {
  const firstSegment = path?.split('/')[0];
  return firstSegment && state.locales.includes(firstSegment)
    ? firstSegment
    : (state.defaultLocale ?? undefined);
}

/**
 * Turn a sitemap item's `updated_at` into a `lastmod` date.
 *
 * The API sends a Unix timestamp in **seconds**, `Date` expects milliseconds.
 * Anything that is not a usable timestamp yields `undefined`, so the entry is
 * emitted without a `lastmod` rather than with an invented one — search engines
 * discount `lastmod` site-wide once it stops matching reality, which is exactly
 * what stamping every entry with "now" on each regeneration would do.
 */
function toLastModified(updatedAt: number | string | undefined): Date | undefined {
  const seconds = typeof updatedAt === 'string' ? Number(updatedAt) : updatedAt;

  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
    return undefined;
  }

  const date = new Date(seconds * 1000);

  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Initialize and return a FlyoInstance.
 *
 * Call once in your flyo.config.tsx and export the result.
 * The returned object carries all methods bound to the configuration,
 * eliminating the need for global state.
 *
 * @example
 * ```tsx
 * // flyo.config.tsx
 * import { initNitro } from '@flyo/nitro-next/server';
 *
 * export const flyo = initNitro({
 *   accessToken: process.env.FLYO_ACCESS_TOKEN || '',
 *   lang: 'en',
 *   baseUrl: process.env.SITE_URL || 'http://localhost:3000',
 *   liveEdit: process.env.FLYO_LIVE_EDIT === 'true',
 *   components: { HeroBanner, Text },
 * });
 * ```
 */
export function initNitro({
  accessToken,
  lang,
  locales,
  defaultLocale,
  baseUrl,
  components,
  showMissingComponentAlert,
  liveEdit,
  serverCacheTtl,
  clientCacheTtl,
  draftUrlMarker,
}: {
  accessToken: string;
  lang?: string;
  /** All supported locale shortcodes, e.g. `['de', 'en']`. Enables per-request i18n. */
  locales?: string[];
  /** The primary/default locale (no URL prefix). Defaults to `lang`. Should match `config.nitro.primary_language`. */
  defaultLocale?: string;
  baseUrl?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  components?: Record<string, any>;
  showMissingComponentAlert?: boolean;
  liveEdit?: boolean;
  serverCacheTtl?: number;
  clientCacheTtl?: number;
  /**
   * Query parameter a resolved draft link is redirected onto, so that
   * {@link createProxy} can answer it with `no-store` instead of the configured
   * cache TTLs. Defaults to `'flyo-draft'`; pass your own name to rename it, or
   * `false` to switch the redirect off entirely (drafts then still skip Next's
   * own render cache, but browser and CDN cache them like any other page).
   */
  draftUrlMarker?: string | false;
}): FlyoInstance {
  const configuration = new Configuration({ apiKey: accessToken });

  const resolvedDefaultLocale = defaultLocale ?? lang ?? null;
  const resolvedLocales = locales ?? (resolvedDefaultLocale ? [resolvedDefaultLocale] : []);

  const state: NitroState = {
    accessToken,
    lang: lang ?? null,
    locales: resolvedLocales,
    defaultLocale: resolvedDefaultLocale,
    baseUrl: baseUrl ?? null,
    components: components ?? {},
    showMissingComponentAlert: showMissingComponentAlert ?? liveEdit ?? false,
    liveEdit: liveEdit ?? false,
    serverCacheTtl: serverCacheTtl ?? 1200,
    clientCacheTtl: clientCacheTtl ?? 900,
    draftUrlMarker: draftUrlMarker === false ? null : (draftUrlMarker ?? DEFAULT_DRAFT_URL_MARKER),
  };

  // A site is multilingual only with more than one configured locale. A bare
  // `lang` (or a single-entry `locales`) is a single-language setup, and every
  // language-switcher publish below is skipped for it.
  const isMultilingual = (): boolean => state.locales.length > 1;

  const getRequestLocale = async (): Promise<string | undefined> => {
    try {
      const requestHeaders = await headers();
      const headerLocale = requestHeaders.get('x-flyo-locale');
      if (headerLocale) {
        return headerLocale;
      }
    } catch {
      // `headers()` throws outside a request scope (build time, tests, …) — fall back below.
    }
    return state.defaultLocale ?? state.lang ?? undefined;
  };

  // React-cached per requested locale, so different languages don't collide on
  // one memoized value and the same locale is only fetched once per request.
  const fetchConfig = cache(async (lang?: string): Promise<ConfigResponse> => {
    const configApi = new ConfigApi(configuration);
    return configApi.config({ lang: lang ?? undefined });
  });

  const getNitroConfig = async (lang?: string): Promise<ConfigResponse> => {
    const useLang = lang ?? (await getRequestLocale());
    return fetchConfig(useLang);
  };

  const pageResolveRoute = cache(async ({ params }: RouteParams) => {
    const { slug } = await params;
    const segments = slug ?? [];
    // Pages are addressed by their full, globally-unique slug (locale prefix
    // included), which is exactly what the catch-all captures — pass it through.
    const path = segments.join('/');

    // Derive the active locale from the leading path segment when it is a
    // configured locale (matches the Laravel adapter's `request()->segment(1)`).
    const lang = deriveLangFromPath(path, state);

    // Every `notFound()` below hands the request off to `not-found.tsx`, but this
    // route still owns the request-scoped language-links store (see the store
    // notes below). Settle it with an empty list *before* bailing, so a
    // switcher in shared chrome resolves immediately and renders its `default`
    // entries instead of hanging. Doing it here (and never in `not-found.tsx`)
    // also keeps the fallback from racing a real route's links: the App Router
    // renders the root `not-found.tsx` even on 200s, so publishing there would
    // poison pages that *do* have translations.
    const publishNotFoundFallback = () => publishLanguageLinks([]);

    const cfg = await getNitroConfig(lang);

    if (!cfg.pages?.includes(path)) {
      publishNotFoundFallback();
      notFound();
    }

    const page = await new PagesApi(configuration)
      .page({ slug: path, lang })
      .catch((error: unknown) => {
        console.error('Error fetching page:', path, error);
        publishNotFoundFallback();
        notFound();
      });

    if (!page) {
      publishNotFoundFallback();
      notFound();
    }

    // Publish this page's switcher links so a switcher in shared chrome (e.g.
    // a footer in the root layout) can render them on the first, full load.
    // Single-language sites publish an empty list — a mounted switcher then
    // settles immediately and renders nothing.
    publishLanguageLinks(
      isMultilingual()
        ? getLanguageLinks(page.translation, { currentLang: lang, locales: state.locales })
        : [],
    );

    return { page, path, lang, cfg };
  });

  const sitemap = async (): Promise<MetadataRoute.Sitemap> => {
    const sitemapApi = new SitemapApi(configuration);
    const sitemapLang = state.lang ?? undefined;

    if (!state.baseUrl) {
      throw new Error('baseUrl is not configured. Please set it in initNitro().');
    }

    // `SitemapinterfaceInner`, not `EntityinterfaceInner`: since SDK v2 the
    // endpoint has a model of its own, carrying exactly what a sitemap needs —
    // `href`, `updated_at`, `entity_unique_id`. Title, teaser, image and
    // `entity_time_start` are *not* on it; read those from `SearchApi.search()`
    // or `EntitiesApi` instead. Leave the array unannotated so the compiler can
    // point at any read that outgrew the model.
    const items = await sitemapApi.sitemap({ lang: sitemapLang });

    // The API resolves the final URL path of every sitemap item into `href`
    // (all language variants included), so we no longer stitch a path together
    // from the deprecated `routes` / `entity_slug` / `entity_type` fields.
    // Items without an `href` have no reachable route and are skipped —
    // emitting them would duplicate the base URL.
    return items.reduce<MetadataRoute.Sitemap>((entries, item) => {
      const href = item.href?.trim();

      if (!href) {
        return entries;
      }

      // Resolved exactly like the canonical and hreflang URLs, so the sitemap
      // and the `<head>` of a page never disagree about its address.
      const url = resolveContentUrl(href, state.baseUrl);

      // `updated_at` is when the content of that URL last actually changed, so
      // it is the honest `lastmod`. Items that ship without one are emitted
      // without a `lastmod` at all.
      const lastModified = toLastModified(item.updated_at);

      entries.push(lastModified ? { url, lastModified } : { url });

      return entries;
    }, []);
  };

  return {
    state,
    getNitroConfig,
    getRequestLocale,
    isMultilingual,
    getNitroPages: () => new PagesApi(configuration),
    getNitroEntities: () => new EntitiesApi(configuration),
    getNitroSitemap: () => new SitemapApi(configuration),
    getNitroSearch: () => new SearchApi(configuration),
    pageResolveRoute,
    sitemap,
  };
}

// ─── Request-scoped language-switcher store ──────────────────────────────────
//
// A page's / entity's `translation[]` is resolved deep in the route tree (in the
// catch-all page route or an entity detail route). A language switcher, however,
// usually lives in *shared chrome* — a footer, say — that is rendered by the
// **root layout**. In the App Router the root layout is an *ancestor* of the
// page, so it cannot receive the page's data as props: data only flows down.
//
// This store bridges that gap. The page/entity route **publishes** its resolved
// links; the switcher in the footer **reads** them. It is a per-request deferred,
// created once per request via React `cache()` (so the layout and the page see
// the *same* instance), holding a promise the footer awaits.
//
// Why the reader awaits a promise instead of reading a plain value: the root
// layout (and therefore its footer) renders *above*, and concurrently with, the
// page — so a synchronous read could run before the page has resolved. Awaiting
// suspends the footer until the links are published, regardless of render order.

interface LanguageLinksStore {
  /**
   * Publish the links once. Later calls are ignored (first publish wins).
   *
   * The active page/entity route is the single writer per request: it publishes
   * the resolved translations on success and a fallback before any `notFound()`.
   * "First wins" then only guards against the route's render pass and its
   * `generateMetadata` both publishing (they publish the same links) — no other
   * caller races it.
   */
  publish(links: FlyoLanguageLink[]): void;
  /** A promise that resolves when the links are published. */
  read(): Promise<FlyoLanguageLink[]>;
}

/**
 * A single deferred language-links channel: one writer, many readers,
 * order-independent. Internal — the public surface is `NitroLanguageSwitcher`
 * (the reader) and `NitroLanguageLinks` (the writer for custom routes).
 */
function createLanguageLinksStore(): LanguageLinksStore {
  let resolve!: (links: FlyoLanguageLink[]) => void;
  const promise = new Promise<FlyoLanguageLink[]>((r) => {
    resolve = r;
  });
  let settled = false;
  return {
    publish(links: FlyoLanguageLink[]) {
      // First publish wins — a route resolves once per request, and both the
      // render pass and `generateMetadata` share this store, so guard against a
      // double resolve.
      if (!settled) {
        settled = true;
        resolve(links);
      }
    },
    read() {
      return promise;
    },
  };
}

// `cache()` gives one store per request, shared across the whole server
// component tree for that request. A fresh request gets a fresh store.
const languageLinksStore = cache(createLanguageLinksStore);

/**
 * Publish the current route's language-switcher links into the request-scoped
 * server store (internal). The route helpers call this on every resolve path;
 * custom routes publish via the `NitroLanguageLinks` component instead, which
 * also feeds the client half.
 *
 * Never publish from `not-found.tsx`: the App Router renders the root
 * not-found boundary on *every* request (synchronously, ahead of a route's
 * awaited CMS fetch), and with a first-wins store that would settle the
 * fallback before the real route publishes. The route helpers already publish
 * a fallback before every `notFound()`, so real 404s are covered.
 */
function publishLanguageLinks(links: FlyoLanguageLink[]): void {
  languageLinksStore().publish(links);
}

/**
 * Await the current route's language-switcher links (internal — the reader
 * behind `NitroLanguageSwitcher`). Suspends until the active route publishes,
 * regardless of whether the layout or the page renders first.
 */
function readLanguageLinks(): Promise<FlyoLanguageLink[]> {
  const read = languageLinksStore().read();

  // Safety net: if nothing ever publishes (a custom route that renders the
  // switcher without `NitroLanguageLinks`), resolve with an empty list instead
  // of suspending the stream forever — an invisible switcher beats a hung page.
  return Promise.race([
    read,
    new Promise<FlyoLanguageLink[]>((resolve) => {
      const timer = setTimeout(() => {
        console.warn(
          '[flyo] NitroLanguageSwitcher: no route published language links within ' +
            `${READ_LANGUAGE_LINKS_TIMEOUT_MS}ms — rendering an empty switcher. ` +
            'Custom routes must render <NitroLanguageLinks links={…} /> (see the README\'s "Language switcher" section).',
        );
        resolve([]);
      }, READ_LANGUAGE_LINKS_TIMEOUT_MS);
      // Don't keep the process alive for the timer; clear it on the normal path.
      (timer as { unref?: () => void }).unref?.();
      read.then(() => clearTimeout(timer));
    }),
  ]);
}

const READ_LANGUAGE_LINKS_TIMEOUT_MS = 5000;

/**
 * The complete language switcher for shared chrome — drop it into the footer
 * (or header) of your **root layout** and you're done. Handles both App Router
 * pitfalls internally: it renders the correct links into the first,
 * server-rendered document (via the request-scoped store the route helpers
 * publish to), and it live-updates across soft (client-side) navigations,
 * which never re-render the layout (via the client store).
 *
 * **You define the switcher via the required `default` prop** — the locale
 * set, the display order, and the labels (so you decide whether/how labels are
 * translated). The active route's published links contribute only the
 * translated hrefs and the current-locale flag; a locale the route has no
 * translation for links to its default href (typically the locale's home).
 * A route that publishes nothing at all renders the defaults verbatim.
 *
 * By default it renders minimal semantic markup (`nav > ul > li > a`) that you
 * can style with CSS:
 *
 * @example
 * ```tsx
 * // app/layout.tsx
 * import { NitroLanguageSwitcher } from '@flyo/nitro-next/server';
 *
 * <footer>
 *   <NitroLanguageSwitcher
 *     default={[
 *       { shortcode: 'de', name: 'Deutsch', href: '/' },
 *       { shortcode: 'en', name: 'English', href: '/en' },
 *     ]}
 *   />
 * </footer>
 * ```
 *
 * For custom markup, pass `component` — a **client component** (exported from
 * a `'use client'` file; an inline function in the layout is not serializable
 * and Next.js will reject it) receiving the merged `{ links }`:
 *
 * ```tsx
 * // components/language-switcher.tsx
 * 'use client';
 * import type { FlyoLanguageLink } from '@flyo/nitro-next/client';
 *
 * export function LanguageSwitcher({ links }: { links: FlyoLanguageLink[] }) {
 *   return (
 *     <nav aria-label="Language">
 *       {links.map((l) => (
 *         // Native <a>, NOT next/link — a language switch must reload the shared chrome.
 *         <a key={l.shortcode} href={l.href!} aria-current={l.isCurrent || undefined}>{l.name}</a>
 *       ))}
 *     </nav>
 *   );
 * }
 * ```
 */
export function NitroLanguageSwitcher({
  default: defaultLocales,
  component,
}: {
  /** The switcher definition: locale set, display order, and labels. */
  default: FlyoSwitcherLocale[];
  /** Client component rendering the merged links. Omit for the built-in markup. */
  component?: React.ComponentType<{ links: FlyoLanguageLink[] }>;
}) {
  // Suspense is built in: the async inner part suspends on the store until the
  // active route publishes, while the rest of the layout renders and streams.
  return (
    <Suspense fallback={null}>
      <NitroLanguageSwitcherResolved default={defaultLocales} component={component} />
    </Suspense>
  );
}

/** Awaits the server store and hands off to the client half (internal). */
async function NitroLanguageSwitcherResolved({
  default: defaultLocales,
  component,
}: {
  default: FlyoSwitcherLocale[];
  component?: React.ComponentType<{ links: FlyoLanguageLink[] }>;
}) {
  const initial = await readLanguageLinks();
  return (
    <NitroLanguageSwitcherClient initial={initial} default={defaultLocales} component={component} />
  );
}

/**
 * Publish the given language-switcher links for the current route — on the
 * server **and** in the browser. Renders nothing.
 *
 * This is the one component a **custom route** (a hand-written page Flyo does
 * not resolve) renders so a `NitroLanguageSwitcher` in shared chrome shows that
 * route's links. It settles the request-scoped server store (the switcher's
 * initial, server-rendered value) and renders the client publisher (what keeps
 * the switcher current across soft navigations).
 *
 * `NitroPage` and `nitroEntityRoute` render it automatically — Flyo-resolved
 * routes need nothing. Never render it in `not-found.tsx` (the App Router
 * renders that boundary on every request, where it would race the real route).
 *
 * @example
 * ```tsx
 * // e.g. app/gallery/page.tsx — a hand-built page that exists in de + en
 * import { NitroLanguageLinks } from '@flyo/nitro-next/server';
 * import { flyo } from '@/flyo.config';
 *
 * export default async function GalleryPage() {
 *   const currentLang = await flyo.getRequestLocale();
 *   return (
 *     <>
 *       <NitroLanguageLinks
 *         links={[
 *           { shortcode: 'de', name: 'Deutsch', href: '/de/galerie', isCurrent: currentLang === 'de', exists: true },
 *           { shortcode: 'en', name: 'English', href: '/en/gallery', isCurrent: currentLang === 'en', exists: true },
 *         ]}
 *       />
 *       {/* … page content … *\/}
 *     </>
 *   );
 * }
 * ```
 */
export function NitroLanguageLinks({ links }: { links: FlyoLanguageLink[] }) {
  publishLanguageLinks(links);
  return <NitroLanguageLinksPublisher links={links} />;
}

// ─── Helper ──────────────────────────────────────────────────────────────────

/**
 * Helper function to read environment variables with fallback
 */
const readEnv = (key: string, fallback = ""): string => {
  const value = process.env[key];
  if (value !== undefined && value !== "") {
    return String(value);
  }
  return fallback;
};

/**
 * Resolve a CMS `href` into the URL that goes into the metadata.
 *
 * An absolute href is kept as it is; a path gets its leading slash and — when
 * `initNitro({ baseUrl })` is configured — the site origin, so canonical and
 * hreflang tags carry the fully qualified URLs search engines expect, matching
 * what `flyo.sitemap()` emits for the same content. Without a `baseUrl` the
 * path is returned unchanged and Next.js resolves it against `metadataBase`.
 */
function resolveContentUrl(href: string, baseUrl?: string | null): string {
  if (/^https?:\/\//i.test(href)) {
    return href;
  }

  const path = href.startsWith('/') ? href : `/${href}`;

  if (!baseUrl) {
    return path;
  }

  const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

  return `${cleanBaseUrl}${path}`;
}

/**
 * `href` is the API's generic link field, and a page's `type` can be `email`,
 * `tel` or `file` — those carry a `mailto:` / `tel:` / download target instead
 * of a document URL, and only a document URL can be a canonical.
 */
function isDocumentHref(href: string): boolean {
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(href);

  return !scheme || /^https?$/i.test(scheme[1]);
}

/**
 * Build Next.js `alternates` (hreflang + canonical) from a page's or entity's
 * `translation[]`, falling back to the content's own `href` for the canonical.
 * Returns `undefined` when neither yields anything.
 */
function buildLanguageAlternates(
  translations: Translation[] | undefined,
  options: {
    /** The active locale — its translation becomes the canonical. */
    currentLang?: string;
    /**
     * The content's own href (`page.href`), used as the canonical whenever the
     * translations produce none: a single-language site has an empty
     * `translation[]`, and a multilingual one can be missing the entry for the
     * locale currently being rendered.
     */
    href?: string;
    /** `initNitro({ baseUrl })`, so the emitted URLs are fully qualified. */
    baseUrl?: string | null;
  } = {},
): Metadata['alternates'] | undefined {
  const { currentLang, href, baseUrl } = options;
  const languages: Record<string, string> = {};
  let canonical: string | undefined;

  for (const t of translations ?? []) {
    const shortcode = t.language?.shortcode;
    const translationHref = t.href?.trim();
    if (shortcode && translationHref) {
      languages[shortcode] = resolveContentUrl(translationHref, baseUrl);
      if (currentLang && shortcode === currentLang) {
        canonical = languages[shortcode];
      }
    }
  }

  const selfHref = href?.trim();

  if (!canonical && selfHref && isDocumentHref(selfHref)) {
    canonical = resolveContentUrl(selfHref, baseUrl);
  }

  if (!canonical && Object.keys(languages).length === 0) {
    return undefined;
  }

  return {
    ...(canonical ? { canonical } : {}),
    ...(Object.keys(languages).length > 0 ? { languages } : {}),
  };
}

/**
 * Build a social-preview image URL in the Flyo CDN query format
 * (`?w=…&h=…&format=jpg`), the successor of the deprecated `/thumb/{w}x{h}`
 * path segment. Both `w` and `h` are set, so the CDN crops and applies the
 * asset's focal point.
 *
 * A page's `meta_json.image` is `false` — not `''` — when no meta image is set
 * (hence the `MetaImage` union), so a plain falsy check is not enough to make
 * TypeScript happy about the string operations below.
 */
function buildSocialImageUrl(
  image: MetaImage | undefined,
  width: number,
  height: number,
): string | undefined {
  if (typeof image !== 'string' || !image) {
    return undefined;
  }

  // The image URL may already carry a query string.
  const separator = image.includes('?') ? '&' : '?';
  return `${image}${separator}w=${width}&h=${height}&format=jpg`;
}

/**
 * Take a resolved draft out of every cache.
 *
 * `is_draft` only becomes known once the API has answered, half-way through the
 * render — and a Server Component cannot set response headers. So this does the
 * two things that *are* possible from inside a render:
 *
 * 1. Reading `headers()` is a Next.js *dynamic API*: the call alone marks this
 *    render dynamic, which keeps the draft out of Next's own Full Route Cache
 *    and ISR store. Without it the first visit to a draft token would be
 *    rendered once and then replayed to everyone else from the server cache —
 *    including after the link has expired.
 * 2. It redirects once onto the same URL carrying the draft marker, which is
 *    the signal {@link createProxy} reads to answer with `no-store` for the
 *    browser *and* the CDN. Step 1 alone only covers Next's server cache: the
 *    proxy sets `Cache-Control` before the render runs, and Next only fills in
 *    a `Cache-Control` that is not already there.
 *
 * The redirect is skipped when the URL is already marked, when the instance
 * turned marking off (`draftUrlMarker: false`), and when the proxy is not in
 * front of this route — without it there is neither a cache header to correct
 * nor a way to learn the current URL.
 */
async function enterDraftMode(flyo: FlyoInstance): Promise<void> {
  let requestHeaders: Headers;

  try {
    requestHeaders = await headers();
  } catch {
    // Outside a request scope (unit tests, build-time probing) `headers()`
    // throws, and there is no response to keep out of a cache anyway.
    return;
  }

  const marker = flyo.state.draftUrlMarker;

  if (!marker) {
    return;
  }

  // Second pass: the proxy already saw the marker and has answered `no-store`.
  if (requestHeaders.get(DRAFT_REQUEST_HEADER) === '1') {
    return;
  }

  // Set by `createProxy()` on every request. Its absence means the proxy does
  // not cover this route, so no cache header of ours is in the way.
  const requestPath = requestHeaders.get(DRAFT_PATH_HEADER);

  if (!requestPath) {
    return;
  }

  const target = withDraftMarker(requestPath, marker);

  // `withDraftMarker` hands the path back unchanged when the marker is already
  // on it, so this is the guard that makes a redirect loop impossible — even on
  // a host that drops the header checked above.
  if (target === requestPath) {
    return;
  }

  redirect(target);
}

/**
 * Internal helper to wrap and cache entity resolvers.
 *
 * Also publishes the entity's language-switcher links into the request-scoped
 * store (see {@link publishLanguageLinks}) so a switcher in shared chrome can
 * read them via `readLanguageLinks()`, and takes a draft response out of the
 * caches (see {@link enterDraftMode}).
 */
function createCachedEntityResolver<T>(
  flyo: FlyoInstance,
  resolver: EntityResolver<T>
): (props: EntityRouteParams<T>) => Promise<Entity> {
  return cache(async ({ params }: EntityRouteParams<T>) => {
    // As with `pageResolveRoute`, this resolver owns the request's language-links
    // store even when it bails. Settle it with an empty list before every
    // not-found path (a missing entity, a `notFound()` from the resolver, a
    // failed CMS fetch) so a switcher in shared chrome resolves immediately and
    // renders its `default` entries — and never publish from `not-found.tsx`,
    // which the App Router also renders on 200s.
    const publishNotFoundFallback = () => publishLanguageLinks([]);

    let entity: Entity;
    try {
      entity = await resolver(params);
    } catch (error) {
      publishNotFoundFallback();
      throw error;
    }

    if (!entity) {
      publishNotFoundFallback();
      notFound();
    }

    publishLanguageLinks(
      flyo.isMultilingual()
        ? getLanguageLinks(entity.translation, { currentLang: entity.language, locales: flyo.state.locales })
        : [],
    );

    // After the publish above, so a redirect never leaves a switcher in shared
    // chrome waiting on links that are no longer coming.
    if (entity.is_draft) {
      await enterDraftMode(flyo);
    }

    return entity;
  });
}

// ─── Server Components ───────────────────────────────────────────────────────

/**
 * Build the debug line for {@link NitroDebugInfo}, or the "not initialized"
 * marker when the config is unreachable.
 *
 * Separate from the component on purpose: the `try` has to wrap the config
 * fetch and the string building only. Returning JSX from inside it would not
 * catch render errors anyway — React renders the element later, outside this
 * call stack — which is what `react-hooks/error-boundaries` flags.
 */
async function buildDebugInfo(flyo: FlyoInstance): Promise<string> {
  try {
    const config = await flyo.getNitroConfig();
    const { state } = flyo;

    const mode = readEnv("NODE_ENV", "-");
    const vercelDeploymentId = readEnv("VERCEL_DEPLOYMENT_ID", "-");
    const vercelGitCommitSha = readEnv("VERCEL_GIT_COMMIT_SHA", "-");
    const version = readEnv("VERSION", "");

    const tokenValue = state.accessToken || "";
    const token = typeof tokenValue === "string" ? tokenValue : "";
    const tokenType = token.startsWith("p-")
      ? "production"
      : token.startsWith("d-")
      ? "develop"
      : "unknown";

    const debug = state.liveEdit;

    const apiVersion = config.nitro?.version?.toString() || "-";
    const apiLastUpdate = config.nitro?.updated_at
      ? new Date(config.nitro.updated_at * 1000).toLocaleString("de-CH", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "-";

    const debugInfoParts = [
      `liveedit:${debug}`,
      `env:${mode}`,
      `version:${apiVersion}`,
      `versiondate:${apiLastUpdate}`,
      `tokentype:${tokenType}`,
      `did:${vercelDeploymentId}`,
      `csha:${vercelGitCommitSha}`,
    ];

    if (version) {
      debugInfoParts.push(`release:${version}`);
    }

    return debugInfoParts.join(" | ");
  } catch {
    return 'nitro-debug: not initialized';
  }
}

/**
 * NitroDebugInfo Component
 *
 * Async server component that outputs debug information as an HTML comment.
 * Resolves config internally from the flyo instance.
 *
 * @example
 * ```tsx
 * <NitroDebugInfo flyo={flyo} />
 * ```
 */
export async function NitroDebugInfo({ flyo }: { flyo: FlyoInstance }) {
  const debugInfo = await buildDebugInfo(flyo);

  return (
    <template dangerouslySetInnerHTML={{ __html: `<!-- ${debugInfo} -->` }} suppressHydrationWarning />
  );
}

// ─── Draft links ─────────────────────────────────────────────────────────────

/**
 * Format a `draft_expires_at` timestamp for the notice below.
 *
 * The API sends Unix **seconds**, `Date` expects milliseconds. Rendered in UTC
 * on purpose: the server has no idea what timezone the reviewer is in, and a
 * locale-dependent string would differ between the server and the client and
 * trip a hydration warning.
 */
function formatDraftExpiry(expiresAt: number | null | undefined): string | undefined {
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt) || expiresAt <= 0) {
    return undefined;
  }

  const date = new Date(expiresAt * 1000);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/**
 * A visible hint that the page being looked at is a **draft preview** — an
 * expiring snapshot of an entity that is still offline in Flyo — and not the
 * live page. Renders nothing for a regular entity, so it is safe to mount
 * unconditionally.
 *
 * {@link nitroEntityRoute} renders it for you; mount it yourself only when you
 * turned that off (`draftNotice: false`) to place or style it differently.
 *
 * @example
 * ```tsx
 * <NitroDraftNotice entity={entity} />
 * ```
 */
export function NitroDraftNotice({ entity }: { entity: Entity }) {
  if (!entity.is_draft) {
    return null;
  }

  const expiry = formatDraftExpiry(entity.draft_expires_at);

  return (
    <div
      data-flyo-draft-notice=""
      role="status"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 2147483647,
        padding: '8px 16px',
        background: '#facc15',
        color: '#1c1917',
        font: '500 14px/1.4 system-ui, sans-serif',
        textAlign: 'center',
      }}
    >
      Draft preview — this content is not published
      {expiry ? <> · link expires {expiry}</> : null}
    </div>
  );
}

// ─── JSON-LD ─────────────────────────────────────────────────────────────────

/**
 * Reduce an API `jsonld` field to a document worth rendering, or `undefined`.
 *
 * "No JSON-LD configured" does not arrive as `null`: the pages endpoint sends an
 * empty object (`{}`) and the entities endpoint an empty array (`[]`) — both
 * truthy. Without this check every page would ship a `<script>` containing `{}`.
 * A non-empty array is kept: JSON-LD legitimately allows a list of nodes.
 */
function normalizeJsonLd(value: unknown): object | undefined {
  // Defensive: an un-decoded document (a JSON string) still renders.
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    try {
      return normalizeJsonLd(JSON.parse(trimmed));
    } catch {
      return undefined;
    }
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? value : undefined;
  }

  if (value !== null && typeof value === 'object') {
    return Object.keys(value).length > 0 ? value : undefined;
  }

  return undefined;
}

// A page's / entity's JSON-LD is emitted automatically (by `NitroPage` and
// `nitroEntityRoute`), while projects written against earlier versions still
// render `<NitroEntityJsonLd entity={entity} />` inside their entity `render`.
// Both produce the *same* document, so each serialized document is claimed once
// per request and the first renderer wins: upgrading keeps emitting exactly one
// `<script>` per document, with no code change. Documents that genuinely differ
// (a page's `WebPage` plus an entity's `Thing`, say) are all emitted.
//
// `cache()` scopes the claim set to a single request, the same mechanism the
// language-links store above relies on. Outside a request scope React's `cache()`
// memoizes nothing and hands back a fresh set per call, so nothing is ever
// suppressed across requests — the safe direction to fail in.
const claimedJsonLd = cache((): Set<string> => new Set<string>());

/** `true` when this exact document has not been claimed yet in this request. */
function claimJsonLd(serialized: string): boolean {
  const claimed = claimedJsonLd();

  if (claimed.has(serialized)) {
    return false;
  }

  claimed.add(serialized);
  return true;
}

/**
 * Renders a `<script type="application/ld+json">` for any JSON-LD document —
 * the building block behind {@link NitroPageJsonLd} and
 * {@link NitroEntityJsonLd}. Renders nothing for an empty document (the API
 * sends `{}` / `[]` when none is configured) or one already emitted in this
 * request. Escapes `<` so the document cannot break out of the script tag.
 *
 * @example
 * ```tsx
 * <NitroJsonLd data={{ '@context': 'https://schema.org', '@type': 'Organization', name: 'Flyo' }} />
 * ```
 */
export function NitroJsonLd({ data }: { data: unknown }) {
  const jsonLd = normalizeJsonLd(data);

  if (!jsonLd) {
    return null;
  }

  const serialized = JSON.stringify(jsonLd).replace(/</g, '\\u003c');

  if (!claimJsonLd(serialized)) {
    return null;
  }

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serialized }} />;
}

/**
 * Renders the page's JSON-LD structured data (`page.jsonld`, e.g. a `WebPage`
 * document maintained in Flyo).
 *
 * {@link NitroPage} renders this automatically, so pages resolved through
 * `nitroPageRoute` need nothing. Render it yourself in a **custom page route**
 * that renders blocks by hand instead of via `NitroPage`.
 */
export function NitroPageJsonLd({ page }: { page: Page }) {
  return <NitroJsonLd data={page?.jsonld} />;
}

/**
 * Renders the entity's JSON-LD structured data (`entity.jsonld`).
 *
 * {@link nitroEntityRoute} renders this automatically, so entity detail routes
 * built with it need nothing — an existing `<NitroEntityJsonLd />` in a
 * `render` function stays harmless (the document is only emitted once per
 * request). Render it yourself in a **custom entity route** that does not go
 * through `nitroEntityRoute`.
 */
export function NitroEntityJsonLd({ entity }: { entity: Entity }) {
  return <NitroJsonLd data={entity?.jsonld} />;
}

/**
 * NitroPage renders all blocks from a Flyo page.
 *
 * It also renders the page's structured data ({@link NitroPageJsonLd}), the
 * page-level counterpart of the entity JSON-LD rendered by
 * {@link nitroEntityRoute}.
 *
 * On multilingual sites it also renders {@link NitroLanguageLinks} with the
 * page's language links (derived from `page.translation` and the page's
 * locale-prefixed slug), so a {@link NitroLanguageSwitcher} in shared chrome
 * stays correct on full loads *and* across soft (client-side) navigations.
 */
export function NitroPage({
  page,
  flyo,
}: {
  page: Page;
  flyo: FlyoInstance;
}) {
  // Rendered even for a page without blocks — it describes the page, not its
  // content.
  const structuredData = <NitroPageJsonLd page={page} />;

  const blocks = Array.isArray(page?.json)
    ? page.json.map((block: Block, index: number) => (
        <NitroBlock
          key={block.uid || index}
          block={block}
          flyo={flyo}
        />
      ))
    : null;

  if (!flyo.isMultilingual()) {
    return (
      <>
        {structuredData}
        {blocks}
      </>
    );
  }

  const languageLinks = getLanguageLinks(page.translation, {
    currentLang: deriveLangFromPath(page.slug, flyo.state),
    locales: flyo.state.locales,
  });

  return (
    <>
      <NitroLanguageLinks links={languageLinks} />
      {structuredData}
      {blocks}
    </>
  );
}

/**
 * NitroBlock renders a single block using the registered component.
 */
export function NitroBlock({
  block,
  flyo,
}: {
  block: Block;
  flyo: FlyoInstance;
}) {
  if (!block) {
    return null;
  }

  const Component = block.component ? flyo.state.components[block.component] : undefined;

  if (Component) {
    return <Component block={block} />;
  }

  if (flyo.state.showMissingComponentAlert) {
    return (
      <div style={{ border: '1px solid #fff', padding: '1rem', marginBottom: '1rem', backgroundColor: 'red' }}>
        Component <b>{block.component}</b> not found.
      </div>
    );
  }

  return null;
}

/**
 * NitroSlot renders nested blocks from a slot.
 * Used for recursive block rendering when blocks contain slots.
 *
 * @example
 * ```tsx
 * import { flyo } from '@/flyo.config';
 * import { NitroSlot } from '@flyo/nitro-next/server';
 *
 * export function MyComponent({ block }) {
 *   return (
 *     <div>
 *       <NitroSlot slot={block.slots?.content} flyo={flyo} />
 *     </div>
 *   );
 * }
 * ```
 */
export function NitroSlot({
  slot,
  flyo,
}: {
  slot?: {
    content?: Block[];
  };
  flyo: FlyoInstance;
}) {
  if (!slot?.content || !Array.isArray(slot.content)) {
    return null;
  }

  return (
    <>
      {slot.content.map((block: Block, index: number) => (
        <NitroBlock
          key={block.uid || index}
          block={block}
          flyo={flyo}
        />
      ))}
    </>
  );
}

// ─── Factory Functions ───────────────────────────────────────────────────────

/**
 * Create a page route handler for Nitro pages.
 * Returns a Next.js page component function.
 *
 * @example
 * ```tsx
 * import { flyo } from '@/flyo.config';
 * import { nitroPageRoute } from '@flyo/nitro-next/server';
 *
 * export default nitroPageRoute(flyo);
 * ```
 */
export function nitroPageRoute(flyo: FlyoInstance) {
  async function pageRoute(props: RouteParams) {
    const { page } = await flyo.pageResolveRoute(props);
    return <NitroPage page={page} flyo={flyo} />;
  }
  return pageRoute;
}

/**
 * Create a metadata generator for Nitro pages.
 * Returns a Next.js generateMetadata function.
 *
 * @example
 * ```tsx
 * import { flyo } from '@/flyo.config';
 * import { nitroPageGenerateMetadata } from '@flyo/nitro-next/server';
 *
 * export const generateMetadata = nitroPageGenerateMetadata(flyo);
 * ```
 */
export function nitroPageGenerateMetadata(flyo: FlyoInstance) {
  return async (props: RouteParams): Promise<Metadata> => {
    const { page, lang } = await flyo.pageResolveRoute(props);

    const meta = page.meta_json;
    const title = meta?.title || page.title || '';
    const description = meta?.description ?? '';
    const image = meta?.image;

    const ogImage = buildSocialImageUrl(image, 1200, 630);
    const twImage = buildSocialImageUrl(image, 1200, 600);

    // `page.href` is the page's own resolved URL, so every page gets a
    // self-referencing canonical — not just the multilingual ones, whose
    // canonical comes from the translation of the active locale.
    const alternates = buildLanguageAlternates(page.translation, {
      currentLang: lang,
      href: page.href,
      baseUrl: flyo.state.baseUrl,
    });

    return {
      title,
      description,
      ...(alternates ? { alternates } : {}),
      openGraph: {
        title,
        description,
        images: ogImage ? [ogImage] : [],
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: twImage ? [twImage] : [],
      },
    };
  };
}

/**
 * Create a static params generator for Nitro pages.
 * Returns a Next.js generateStaticParams function.
 *
 * @example
 * ```tsx
 * import { flyo } from '@/flyo.config';
 * import { nitroPageGenerateStaticParams } from '@flyo/nitro-next/server';
 *
 * export const generateStaticParams = nitroPageGenerateStaticParams(flyo);
 * ```
 */
export function nitroPageGenerateStaticParams(flyo: FlyoInstance) {
  return async () => {
    const cfg = await flyo.getNitroConfig();
    const pages = cfg.pages ?? [];

    return pages.map((path: string) => ({
      slug: path === '' ? undefined : path.split('/'),
    }));
  };
}

/**
 * Create an entity route handler with a custom resolver.
 * Returns a Next.js page component function.
 *
 * The entity's structured data ({@link NitroEntityJsonLd}) is rendered
 * automatically, the same way {@link NitroPage} renders the page's.
 *
 * @example
 * ```tsx
 * import { flyo } from '@/flyo.config';
 * import { nitroEntityRoute } from '@flyo/nitro-next/server';
 *
 * const resolver = async (params) => {
 *   const { slug } = await params;
 *   return flyo.getNitroEntities().entityBySlug({ slug, typeId: 123 });
 * };
 *
 * export default nitroEntityRoute(flyo, {
 *   resolver,
 *   render: (entity) => <h1>{entity.entity?.entity_title}</h1>,
 * });
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function nitroEntityRoute<T = any>(
  flyo: FlyoInstance,
  options: {
    resolver: EntityResolver<T>;
    render?: (entity: Entity) => React.ReactNode;
    /**
     * Render {@link NitroDraftNotice} above the content when the resolved entity
     * came from a draft link. Defaults to `true`; set it to `false` to place or
     * style the hint yourself. Regular entities are unaffected either way.
     */
    draftNotice?: boolean;
  }
) {
  const cachedResolver = createCachedEntityResolver(flyo, options.resolver);

  async function entityRoute(props: EntityRouteParams<T>) {
    const entity = await cachedResolver(props);

    const content = options.render ? options.render(entity) : <div>{entity.entity?.entity_title}</div>;

    // Rendered ahead of the content, so a `<NitroEntityJsonLd />` left over in a
    // `render` function is the duplicate that gets skipped, not this one.
    const structuredData = <NitroEntityJsonLd entity={entity} />;

    // Renders nothing unless this response came from a draft link.
    const draftNotice = options.draftNotice === false ? null : <NitroDraftNotice entity={entity} />;

    if (!flyo.isMultilingual()) {
      return (
        <>
          {draftNotice}
          {structuredData}
          {content}
        </>
      );
    }

    // Same as NitroPage: render the entity's language links so a switcher in
    // shared chrome stays correct on full loads and across soft navigations.
    const languageLinks = getLanguageLinks(entity.translation, {
      currentLang: entity.language,
      locales: flyo.state.locales,
    });

    return (
      <>
        <NitroLanguageLinks links={languageLinks} />
        {draftNotice}
        {structuredData}
        {content}
      </>
    );
  }
  return entityRoute;
}

/**
 * Create a metadata generator for entity detail pages.
 * Returns a Next.js generateMetadata function.
 *
 * @example
 * ```tsx
 * import { flyo } from '@/flyo.config';
 * import { nitroEntityGenerateMetadata } from '@flyo/nitro-next/server';
 *
 * export const generateMetadata = nitroEntityGenerateMetadata(flyo, { resolver });
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function nitroEntityGenerateMetadata<T = any>(
  flyo: FlyoInstance,
  options: {
    resolver: EntityResolver<T>;
  }
) {
  const cachedResolver = createCachedEntityResolver(flyo, options.resolver);

  return async (props: EntityRouteParams<T>): Promise<Metadata> => {
    const entity = await cachedResolver(props);

    const title = entity.entity?.entity_title || '';
    const description = entity.entity?.entity_teaser ?? '';
    const image = entity.entity?.entity_image ?? '';

    const ogImage = buildSocialImageUrl(image, 1200, 630);
    const twImage = buildSocialImageUrl(image, 1200, 600);

    // The entities endpoint carries no `href`, so an entity's canonical can
    // only come from its translations.
    const alternates = buildLanguageAlternates(entity.translation, {
      currentLang: entity.language,
      baseUrl: flyo.state.baseUrl,
    });

    return {
      title,
      description,
      ...(alternates ? { alternates } : {}),
      openGraph: {
        title,
        description,
        images: ogImage ? [ogImage] : [],
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: twImage ? [twImage] : [],
      },
    };
  };
}
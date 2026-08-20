'use client';

import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { highlightAndClick, wysiwyg, reload, scrollTo} from '@flyo/nitro-js-bridge';
import { Block, Entity } from "@flyo/nitro-typescript";
import type { ImageLoaderProps } from 'next/image';
import type { FlyoLanguageLink, FlyoSwitcherLocale } from './i18n';

// Framework-agnostic language-links helper — re-exported here so client
// components can build a language switcher from a page/entity `translation[]`
// without importing from `/server` (which would pull server-only code into the
// client bundle).
export { getLanguageLinks } from './i18n';
export type { FlyoLanguageLink, FlyoSwitcherLocale } from './i18n';

// ─── Client-side language-links store ────────────────────────────────────────
//
// The server-side store (`readLanguageLinks` in `/server`) covers the *first*,
// full-document render: the active route publishes, a switcher in the root
// layout awaits. But App Router soft navigation (`<Link>`) re-renders only the
// page segment — the root layout, and any switcher HTML inside it, is preserved
// in the browser as-is. So after a soft navigation the layout's switcher would
// keep showing the *previous* page's language links.
//
// This client store closes that gap. `NitroLanguageLinksPublisher` — rendered
// automatically inside `NitroPage` and `nitroEntityRoute` — pushes the active
// route's links whenever it mounts or receives new props, i.e. on every soft
// navigation. `useLanguageLinks()` subscribes a switcher to those pushes.
//
// The module-level state is browser-only: writes happen inside effects (which
// never run during SSR) and the SSR snapshot is a constant `null`, so server
// renders can't leak state across requests.

type PublishedLanguageLinks = { pathname: string; links: FlyoLanguageLink[] };

let publishedLanguageLinks: PublishedLanguageLinks | null = null;
const languageLinksListeners = new Set<() => void>();

function subscribeLanguageLinks(listener: () => void): () => void {
  languageLinksListeners.add(listener);
  return () => {
    languageLinksListeners.delete(listener);
  };
}

const getLanguageLinksSnapshot = () => publishedLanguageLinks;
const getLanguageLinksServerSnapshot = () => null;

// `useLayoutEffect` so the publish is flushed before the browser paints the
// newly navigated page — the switcher never visibly shows the previous route's
// links. Falls back to `useEffect` during SSR only to silence React's
// useLayoutEffect-on-the-server warning (neither ever runs there).
const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Publishes the active route's language-switcher links into the client-side
 * store, so a switcher in shared chrome (`useLanguageLinks`) updates on soft
 * (client-side) navigations too — not only on full page loads.
 *
 * Renders nothing. `NitroPage` and `nitroEntityRoute` render it for you; only a
 * custom route that bypasses both needs it, via the `NitroLanguageLinks` server
 * component from `@flyo/nitro-next/server` (which also settles the server-side
 * store for the initial render).
 */
export function NitroLanguageLinksPublisher({ links }: { links: FlyoLanguageLink[] }) {
  const pathname = usePathname();
  useClientLayoutEffect(() => {
    publishedLanguageLinks = { pathname, links };
    languageLinksListeners.forEach((notify) => notify());
  }, [pathname, links]);
  return null;
}

/**
 * Subscribe a (client) language-switcher component to the active route's
 * language links. Returns, in order of preference:
 *
 * 1. the links the current route published for the **current pathname** —
 *    live-updated on every soft navigation;
 * 2. `initial` — the server-rendered links passed down from the switcher's
 *    server half — while still on the pathname the document was originally
 *    rendered for (first paint / hydration);
 * 3. `[]` when neither matches — i.e. after navigating to a route that didn't
 *    publish (a custom route missing `NitroLanguageLinks`).
 *
 * @example
 * ```tsx
 * 'use client';
 * import { useLanguageLinks, type FlyoLanguageLink } from '@flyo/nitro-next/client';
 *
 * export function LanguageSwitcherClient({ initial }: { initial: FlyoLanguageLink[] }) {
 *   const links = useLanguageLinks(initial);
 *   if (links.length === 0) return null;
 *   return (
 *     <nav aria-label="Language">
 *       {links.map((l) =>
 *         l.exists
 *           ? <a key={l.shortcode} href={l.href!} aria-current={l.isCurrent || undefined}>{l.name ?? l.shortcode}</a>
 *           : <span key={l.shortcode} aria-disabled>{l.shortcode}</span>,
 *       )}
 *     </nav>
 *   );
 * }
 * ```
 */
export function useLanguageLinks(initial?: FlyoLanguageLink[]): FlyoLanguageLink[] {
  const pathname = usePathname();
  // The pathname this component instance first rendered on — the one the
  // server-rendered `initial` links belong to. Captured once, never updated.
  const [initialPathname] = useState(pathname);
  const published = useSyncExternalStore(
    subscribeLanguageLinks,
    getLanguageLinksSnapshot,
    getLanguageLinksServerSnapshot,
  );

  if (published && published.pathname === pathname) {
    return published.links;
  }
  if (pathname === initialPathname) {
    return initial ?? [];
  }
  return [];
}

/**
 * Client half of `NitroLanguageSwitcher` (from `@flyo/nitro-next/server`) —
 * that server component renders this for you; don't use it directly.
 *
 * Merges the developer-defined `default` entries (set, order, labels) with the
 * active route's published links (hrefs + current locale), then renders
 * `component` with the merged `links` — or minimal semantic default markup
 * when no `component` is given.
 */
export function NitroLanguageSwitcherClient({
  initial,
  default: defaultLocales,
  component: Component,
}: {
  initial: FlyoLanguageLink[];
  default: FlyoSwitcherLocale[];
  component?: React.ComponentType<{ links: FlyoLanguageLink[] }>;
}) {
  const published = useLanguageLinks(initial);

  // The whole switcher logic: the developer's `default` defines which locales
  // appear, in which order, and with which label. The active route's published
  // links only contribute the translated href (and the current-locale flag) —
  // a locale the route has no translation for links to its default href.
  const links: FlyoLanguageLink[] = defaultLocales.map((locale) => {
    const match = published.find((l) => l.shortcode === locale.shortcode);
    return {
      shortcode: locale.shortcode,
      name: locale.name,
      href: match?.href ?? locale.href,
      title: match?.title,
      isCurrent: match?.isCurrent ?? false,
      exists: match?.href != null,
    };
  });

  if (Component) {
    return <Component links={links} />;
  }

  // Headless default markup: semantic, unstyled, native <a> — a language
  // switch must be a full-document navigation so the shared chrome (nav,
  // footer, <html lang>) re-renders in the new locale.
  return (
    <nav aria-label="Language">
      <ul>
        {links.map((l) => (
          <li key={l.shortcode}>
            <a href={l.href!} aria-current={l.isCurrent ? 'true' : undefined}>
              {l.name}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const FLYO_CDN_HOST = 'storage.flyo.cloud';

/**
 * Read a hosting platform's environment marker as "is this the live site?".
 *
 * Returns `undefined` for empty or unrecognised values — not sure — so the next
 * marker in the resolution chain gets its turn.
 */
function toIsProd(value: string | undefined): boolean | undefined {
  switch (value) {
    case 'production':
    case 'prod':
      return true;
    case 'preview':
    case 'staging':
    case 'deploy-preview': // Netlify: pull-request deploy
    case 'branch-deploy': // Netlify: non-production branch deploy
    case 'development':
    case 'dev': // Netlify: `netlify dev`
    case 'test':
      return false;
    default:
      return undefined;
  }
}

/**
 * Live editing is never the live site: a deployment that serves the Flyo editor
 * bridge exists for editors, so it must not count as production.
 *
 * `FLYO_LIVE_EDIT` is the flag `flyo.config.tsx` already uses. It is not public,
 * so it is only readable while server-rendering — for browser code (effects,
 * event handlers) set `NEXT_PUBLIC_FLYO_LIVE_EDIT` too, since only that one is
 * inlined into the client bundle.
 */
const liveEdit =
  process.env.NEXT_PUBLIC_FLYO_LIVE_EDIT === 'true' || process.env.FLYO_LIVE_EDIT === 'true';

/**
 * Check if running on the live production deployment.
 *
 * `NODE_ENV` on its own can't answer this: every hosting platform builds
 * preview, branch and staging deployments with `NODE_ENV=production`, so on
 * Vercel a pull-request preview looks exactly like the live site. Live editing
 * and the platform's own environment marker are therefore consulted first:
 *
 * 1. `FLYO_LIVE_EDIT` / `NEXT_PUBLIC_FLYO_LIVE_EDIT` — live editing on means
 *    this is not production, whatever the platform says.
 * 2. `NEXT_PUBLIC_VERCEL_ENV` — Vercel, exposed automatically for Next.js
 *    projects (`production` | `preview` | `development`).
 * 3. `NEXT_PUBLIC_CONTEXT` — Netlify's `CONTEXT`; set
 *    `NEXT_PUBLIC_CONTEXT=$CONTEXT` in the build command to opt in.
 * 4. `NEXT_PUBLIC_ENV` — the generic convention other platforms are wired to.
 * 5. `NODE_ENV` — the previous behaviour, kept as the last resort.
 *
 * Only live editing or a marker that clearly names a non-production deployment
 * turns this off. Unset or unrecognised values fall through to the next marker,
 * so a platform this doesn't know about behaves exactly as it did before.
 *
 * Beyond `FLYO_LIVE_EDIT` only `NEXT_PUBLIC_*` variables are read (plus
 * `NODE_ENV`, which Next.js treats the same way): they are inlined at build
 * time, so a client component resolves the identical value on the server and in
 * the browser and can't produce a hydration mismatch. Unprefixed markers like
 * `VERCEL_ENV` exist only on the server and would do exactly that.
 *
 * Note that these are inlined statically — reading them through a variable key
 * (`process.env[name]`) would compile to `undefined` in the browser bundle,
 * hence the spelled-out reads below.
 *
 * @example Keep analytics off localhost, previews and editor sessions
 * ```tsx
 * 'use client';
 * import { isProd } from '@flyo/nitro-next/client';
 *
 * export function Analytics() {
 *   if (!isProd) return null;
 *   return <script defer src="https://plausible.io/js/script.js" />;
 * }
 * ```
 */
export const isProd =
  !liveEdit &&
  (toIsProd(process.env.NEXT_PUBLIC_VERCEL_ENV) ??
    toIsProd(process.env.NEXT_PUBLIC_CONTEXT) ??
    toIsProd(process.env.NEXT_PUBLIC_ENV) ??
    process.env.NODE_ENV === 'production');

/**
 * Type for WYSIWYG node structure
 */
export interface WysiwygNode {
  type: string;
  content?: WysiwygNode[];
  [key: string]: unknown;
}

/**
 * Type for WYSIWYG JSON that can be a node, array of nodes, or doc structure
 */
export type WysiwygJson = WysiwygNode | WysiwygNode[] | { type: 'doc'; content: WysiwygNode[] };

/**
 * The minimal block shape `editable()` needs to wire live-editing.
 *
 * `editable()` reads only `uid`, so it deliberately accepts more than the full
 * {@link Block}. The per-block types generated from a project's OpenAPI schema
 * (e.g. `BlockHero`) are NOT structurally assignable to `Block`: their
 * `content`/`config`/`slots` carry an `_empty` marker that clashes with
 * `Block`'s index signatures (`{ [key: string]: BlockSlotValue }`). Typing
 * against the read-surface keeps both the generic `Block` and those generated
 * subtypes assignable, so callers don't need `as unknown as Block` casts.
 */
export type EditableBlock = Pick<Block, 'uid'>;

/**
 * Helper function to get editable props
 */
export function editable(block: EditableBlock): { 'data-flyo-uid'?: string } {
  if (typeof block.uid === 'string' && block.uid.trim() !== '') {
    return { 'data-flyo-uid': block.uid };
  }
  return {};
}

/**
 * Internal client component that sets up live editing functionality
 */
export function FlyoClientWrapper({ 
  children,
}: { 
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    reload();
    
    scrollTo();

    const wireAll = () => {
      const elements = document.querySelectorAll('[data-flyo-uid]');
      elements.forEach((el) => {
        const uid = el.getAttribute('data-flyo-uid');
        if (uid && el instanceof HTMLElement) {
          highlightAndClick(uid, el);
        }
      });
    };

    wireAll();

    const observer = new MutationObserver((mutations) => {
      const hasRelevantChanges = mutations.some(mutation => 
        Array.from(mutation.addedNodes).some(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            return element.hasAttribute('data-flyo-uid') || 
                   element.querySelector('[data-flyo-uid]');
          }
          return false;
        })
      );

      if (hasRelevantChanges) {
        wireAll();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  return <>{children}</>;
}

/**
 * WYSIWYG component for rendering ProseMirror/TipTap JSON content
 * 
 * Uses the `wysiwyg()` function from `@flyo/nitro-js-bridge` to convert
 * nodes to HTML. All consecutive non-custom nodes are joined into a single
 * HTML string so no extra wrapper `<div>` elements are added around each node.
 * 
 * The component wraps all output in a single `<div>` with an optional
 * `className` (defaults to `"wysiwyg"`).
 * 
 * @example
 * ```tsx
 * import { FlyoWysiwyg } from '@flyo/nitro-next/client';
 * import CustomImage from './CustomImage';
 * 
 * export default function MyComponent({ block }) {
 *   return (
 *     <FlyoWysiwyg 
 *       json={block.content.json} 
 *       className="wysiwyg"
 *       components={{
 *         image: CustomImage
 *       }} 
 *     />
 *   );
 * }
 * ```
 */
export function FlyoWysiwyg({
  json,
  className = 'wysiwyg',
  components = {},
}: {
  json: WysiwygJson;
  className?: string;
  components?: Record<string, React.ComponentType<{ node: WysiwygNode }>>;
}) {
  let nodes: WysiwygNode[] = [];

  if (json) {
    if (Array.isArray(json)) {
      nodes = json;
    } else if ('type' in json && json.type === 'doc' && Array.isArray(json.content)) {
      nodes = json.content;
    } else {
      nodes = [json as WysiwygNode];
    }
  }

  // If no custom components are provided, render all nodes as a single HTML block
  const hasCustomComponents = nodes.some((node) => components[node.type]);

  if (!hasCustomComponents) {
    const html = nodes.map((node) => wysiwyg(node)).join('');
    return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
  }

  // When custom components are used, group consecutive non-custom nodes
  // into single HTML blocks to avoid extra wrapper elements.
  const groups: ({ type: 'custom'; component: React.ComponentType<{ node: WysiwygNode }>; node: WysiwygNode } | { type: 'html'; html: string })[] = [];

  for (const node of nodes) {
    const Component = components[node.type];
    if (Component) {
      groups.push({ type: 'custom', component: Component, node });
    } else {
      const html = wysiwyg(node);
      const last = groups[groups.length - 1];
      if (last && last.type === 'html') {
        last.html += html;
      } else {
        groups.push({ type: 'html', html });
      }
    }
  }

  return (
    <div className={className}>
      {groups.map((group, index) => {
        if (group.type === 'custom') {
          return <group.component key={index} node={group.node} />;
        }
        return <div key={index} dangerouslySetInnerHTML={{ __html: group.html }} />;
      })}
    </div>
  );
}

/**
 * Prefixes `src` with the Flyo CDN host unless it already points at it.
 */
function toFlyoCdnUrl(src: string): string {
  if (src.includes(FLYO_CDN_HOST)) {
    return src;
  }

  // Remove leading slash if present to avoid double slashes
  const cleanSrc = src.startsWith('/') ? src.slice(1) : src;
  return `https://${FLYO_CDN_HOST}/${cleanSrc}`;
}

/**
 * Coerces a dimension to what the Flyo CDN accepts: a positive integer.
 *
 * `0`, an empty value and the literal `null` are rejected by the CDN with an
 * HTTP 400, so a sub-pixel result is floored at `1` rather than passed on.
 */
function toFlyoCdnDimension(value: number): number {
  return Math.max(1, Math.round(value));
}

/**
 * Builds a Flyo CDN URL in the query-parameter format (`?w=…&h=…&format=…`).
 *
 * A dynamic side is expressed by *omitting* the parameter: `?w=300` keeps the
 * aspect ratio and derives the height, `?h=300` derives the width. This
 * replaces the deprecated `/thumb/{w}x{h}` path segment.
 *
 * Values above the CDN's limit (2560 px as of 06.08.2026) are capped by the CDN
 * itself, so nothing is clamped here.
 */
function buildFlyoCdnUrl(
  src: string,
  { width, height, format }: { width: number; height?: number; format?: string }
): string {
  const base = toFlyoCdnUrl(src);

  const params = new URLSearchParams();
  params.set('w', String(toFlyoCdnDimension(width)));
  if (height !== undefined) {
    params.set('h', String(toFlyoCdnDimension(height)));
  }
  if (format) {
    params.set('format', format);
  }

  // `src` may already carry a query string (e.g. a signed asset URL).
  return `${base}${base.includes('?') ? '&' : '?'}${params.toString()}`;
}

/**
 * Image loader for Flyo CDN that automatically handles image transformations.
 * Adds Flyo CDN host if not already present and applies width transformations.
 *
 * Emits `?w={width}&format=webp`, i.e. a ratio-preserving resize: the height is
 * left dynamic, so the image keeps its original aspect ratio and is never
 * cropped by the CDN. Because Flyo only applies the asset's focal point when
 * **both** `w` and `h` are set, this loader cannot honour the focal point. Use
 * {@link FlyoCdnLoaderCrop} when the image is rendered in a fixed aspect ratio
 * and the focal point matters.
 *
 * @param src - The image source URL (relative or absolute)
 * @param width - The desired width for the image
 * @returns Transformed image URL with Flyo CDN parameters
 *
 * @example
 * ```tsx
 * <Image
 *   loader={FlyoCdnLoader}
 *   src="me.png"
 *   alt="Picture"
 *   width={500}
 *   height={500}
 * />
 * ```
 */
export function FlyoCdnLoader({ src, width }: ImageLoaderProps): string {
  // Height omitted → the CDN keeps the aspect ratio.
  return buildFlyoCdnUrl(src, { width, format: 'webp' });
}

/**
 * Options for {@link FlyoCdnLoaderCrop}.
 */
export interface FlyoCdnLoaderCropOptions {
  /**
   * Target aspect ratio as `width / height` (e.g. `1` for a square, `16 / 9`
   * for widescreen, `4 / 3`). The loader derives the height from the width
   * next/image requests, so the CDN performs a real crop and applies the
   * asset's focal point.
   *
   * Omit it to fall back to the ratio-preserving `?w={width}` behaviour of
   * {@link FlyoCdnLoader} (focal point not applied).
   */
  aspectRatio?: number;
  /**
   * Output format passed to the CDN. Defaults to `'webp'`.
   */
  format?: string;
  /**
   * Optional upper bound for the requested width, in pixels.
   *
   * The CDN returns the *uncropped original* whenever a resize request exceeds
   * the stored source, so an oversized srcset candidate silently loses the crop
   * — and with it the focal point. Pass the asset's own width here when you
   * know it (Flyo media fields expose the original dimensions) to keep every
   * candidate croppable.
   *
   * Unset by default: the library does not assume any storage limit, the CDN
   * applies its own.
   */
  maxWidth?: number;
}

/**
 * Creates a Flyo CDN image loader that requests a real crop instead of a
 * ratio-preserving resize.
 *
 * next/image never passes `height` to a loader — its signature is
 * `({ src, width, quality })` — so no combination of `<Image>` props can make
 * the CDN return a cropped image. This factory closes that gap: you declare the
 * aspect ratio once at the call site and the loader computes the height for
 * every width in the generated srcset.
 *
 * This matters for focal points: Flyo only applies an asset's focus when both
 * `w` and `h` are set. `?w=400&h=400` honours the focus, `?w=400` does not and
 * the browser ends up centre-cropping via `object-cover` instead.
 *
 * Note that the CDN returns the untouched original — uncropped, focus ignored —
 * for any request wider than the stored asset. Pass `maxWidth` when the source
 * width is known to keep large srcset candidates croppable.
 *
 * @param options - Crop options, see {@link FlyoCdnLoaderCropOptions}
 * @returns A loader function for the next/image `loader` prop
 *
 * @example
 * ```tsx
 * <Image
 *   loader={FlyoCdnLoaderCrop({ aspectRatio: 1 })}
 *   src="me.png"
 *   alt="Picture"
 *   width={700}
 *   height={700}
 * />
 * ```
 *
 * @example With `maxWidth` set to the asset's own width
 * ```tsx
 * export function Hero({ block }) {
 *   return (
 *     <Image
 *       loader={FlyoCdnLoaderCrop({ aspectRatio: 16 / 9, maxWidth: block.content.image.width })}
 *       src={block.content.image.source}
 *       alt={block.content.image.caption}
 *       width={1600}
 *       height={900}
 *     />
 *   );
 * }
 * ```
 */
export function FlyoCdnLoaderCrop(
  options: FlyoCdnLoaderCropOptions = {}
): (props: ImageLoaderProps) => string {
  const { aspectRatio, format = 'webp', maxWidth } = options;

  if (aspectRatio !== undefined && (!Number.isFinite(aspectRatio) || aspectRatio <= 0)) {
    throw new Error(
      `FlyoCdnLoaderCrop: "aspectRatio" must be a positive, finite number (width / height), received ${aspectRatio}.`
    );
  }

  if (maxWidth !== undefined && (!Number.isFinite(maxWidth) || maxWidth < 1)) {
    throw new Error(
      `FlyoCdnLoaderCrop: "maxWidth" must be a finite number of at least 1, received ${maxWidth}.`
    );
  }

  return ({ src, width }: ImageLoaderProps): string => {
    // Optional guard: above the stored source the CDN returns the original,
    // uncropped image and the focal point is lost.
    const requestedWidth = maxWidth === undefined ? width : Math.min(width, maxWidth);

    // Height omitted without an aspect ratio → dynamic side, no crop.
    return buildFlyoCdnUrl(src, {
      width: requestedWidth,
      height: aspectRatio ? requestedWidth / aspectRatio : undefined,
      format,
    });
  };
}

/**
 * FlyoMetric component for tracking entity metrics in production
 * 
 * Automatically sends a metric tracking request to the Flyo API when:
 * - The deployment is the live production one (see {@link isProd}) — preview
 *   deployments and editor sessions are skipped so they don't pollute the
 *   statistics
 * - The entity has a metric API URL configured
 *
 * The request is fired from an effect, i.e. in the browser, so the live-edit
 * exemption needs the public flag: set `NEXT_PUBLIC_FLYO_LIVE_EDIT=true`
 * alongside `FLYO_LIVE_EDIT=true` to keep editor sessions out of the metrics.
 * 
 * @param entity - The entity object containing entity_metric.api
 * 
 * @example
 * ```tsx
 * import { FlyoMetric } from '@flyo/nitro-next/client';
 * 
 * export default function BlogPost(props: RouteParams) {
 *   return nitroEntityRoute(props, {
 *     resolver,
 *     render: (entity: Entity) => (
 *       <>
 *         <FlyoMetric entity={entity} />
 *         <article>
 *           <h1>{entity.entity?.entity_title}</h1>
 *         </article>
 *       </>
 *     )
 *   });
 * }
 * ```
 */
export function FlyoMetric({ entity }: { entity: Entity }) {
  useEffect(() => {
    // Only track metrics in production and if API URL is available
    if (isProd && entity?.entity?.entity_metric?.api) {
      fetch(entity.entity.entity_metric.api);
    }
  }, [entity]);

  // This component doesn't render anything
  return null;
}

/**
 * A thin client wrapper that applies `editable()` to a root element while
 * allowing server-rendered children (e.g. `NitroSlot`) to be passed in.
 *
 * In Next.js, a file marked `'use client'` turns all of its imports into
 * client modules, so you cannot import server-only components like
 * `NitroSlot` directly. The workaround is to keep the server part separate
 * and pass it into this client wrapper via `children`.
 *
 * @example
 * ```tsx
 * // components/HeroBanner.tsx  (server component – no 'use client')
 * import { Block } from '@flyo/nitro-typescript';
 * import { NitroSlot } from '@flyo/nitro-next/server';
 * import { EditableSection } from '@flyo/nitro-next/client';
 *
 * export function HeroBanner({ block }: { block: Block }) {
 *   return (
 *     <EditableSection block={block} className="hero">
 *       <h2>{block?.content?.title}</h2>
 *       <NitroSlot slot={block.slots?.content} />
 *     </EditableSection>
 *   );
 * }
 * ```
 */
export function EditableSection({
  block,
  children,
  className,
  as: Tag = 'section',
}: {
  block: EditableBlock;
  children: React.ReactNode;
  className?: string;
  as?: React.ElementType;
}) {
  return (
    <Tag {...editable(block)} className={className}>
      {children}
    </Tag>
  );
}

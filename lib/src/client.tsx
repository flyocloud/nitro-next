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
 * The deployment environment of the current build.
 *
 * `'preview'` covers every non-live deployment a hosting platform builds in
 * production mode: pull-request previews, branch/staging deploys, etc.
 */
export type FlyoEnv = 'production' | 'preview' | 'development';

/**
 * Normalise a platform's environment marker to a {@link FlyoEnv}.
 *
 * Returns `undefined` for empty or unrecognised values so the next marker in
 * the resolution chain gets its turn.
 */
function toFlyoEnv(value: string | undefined): FlyoEnv | undefined {
  switch (value) {
    case 'production':
    case 'prod':
      return 'production';
    case 'preview':
    case 'staging':
    case 'deploy-preview': // Netlify: pull-request deploy
    case 'branch-deploy': // Netlify: non-production branch deploy
      return 'preview';
    case 'development':
    case 'dev': // Netlify: `netlify dev`
    case 'test':
      return 'development';
    default:
      return undefined;
  }
}

/**
 * The resolved deployment environment.
 *
 * `NODE_ENV` on its own can't answer "is this the live site?": every hosting
 * platform builds preview and branch deployments with `NODE_ENV=production`,
 * so on Vercel a pull-request preview looks exactly like production. That's why
 * the platform's own environment marker is consulted first, in this order:
 *
 * 1. `NEXT_PUBLIC_FLYO_ENV` — explicit override, wins over everything.
 * 2. `NEXT_PUBLIC_VERCEL_ENV` — Vercel, exposed automatically for Next.js
 *    projects (`production` | `preview` | `development`).
 * 3. `NEXT_PUBLIC_CONTEXT` — Netlify's `CONTEXT`; set
 *    `NEXT_PUBLIC_CONTEXT=$CONTEXT` in the build command to opt in.
 * 4. `NEXT_PUBLIC_ENV` — the generic convention other platforms are wired to.
 * 5. `NODE_ENV` — the previous behaviour, kept as the last resort.
 *
 * Only `NEXT_PUBLIC_*` variables are read (plus `NODE_ENV`, which Next.js
 * treats the same way): they are inlined at build time, so a client component
 * resolves the identical value on the server and in the browser and can't
 * produce a hydration mismatch. Unprefixed markers like `VERCEL_ENV` exist only
 * on the server and would do exactly that.
 *
 * Note that these are inlined statically — reading them through a variable key
 * (`process.env[name]`) would compile to `undefined` in the browser bundle,
 * hence the spelled-out reads below.
 */
export const flyoEnv: FlyoEnv =
  toFlyoEnv(process.env.NEXT_PUBLIC_FLYO_ENV) ??
  toFlyoEnv(process.env.NEXT_PUBLIC_VERCEL_ENV) ??
  toFlyoEnv(process.env.NEXT_PUBLIC_CONTEXT) ??
  toFlyoEnv(process.env.NEXT_PUBLIC_ENV) ??
  toFlyoEnv(process.env.NODE_ENV) ??
  'development';

/**
 * Check if running on the live production deployment.
 *
 * True only when {@link flyoEnv} resolves to `'production'`, so preview and
 * branch deployments — which also build with `NODE_ENV=production` — are
 * excluded.
 */
export const isProd = flyoEnv === 'production';

/**
 * Check if running on a preview/staging deployment (pull-request preview,
 * branch deploy, …) rather than the live site or a local dev server.
 */
export const isPreview = flyoEnv === 'preview';

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
 * Image loader for Flyo CDN that automatically handles image transformations.
 * Adds Flyo CDN host if not already present and applies width transformations.
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
  let imageUrl = src;

  // If src doesn't contain the Flyo CDN host, prefix it
  if (!src.includes(FLYO_CDN_HOST)) {
    // Remove leading slash if present to avoid double slashes
    const cleanSrc = src.startsWith('/') ? src.slice(1) : src;
    imageUrl = `https://${FLYO_CDN_HOST}/${cleanSrc}`;
  }

  // Append Flyo CDN transformation parameters
  return `${imageUrl}/thumb/${width}xnull?format=webp`;
}

/**
 * FlyoMetric component for tracking entity metrics in production
 * 
 * Automatically sends a metric tracking request to the Flyo API when:
 * - The deployment is the live production one (see {@link isProd}) — preview
 *   and branch deployments are skipped so they don't pollute the statistics
 * - The entity has a metric API URL configured
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

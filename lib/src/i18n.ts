import type { Translation } from '@flyo/nitro-typescript';

/**
 * A single language option for a language switcher, derived from a page's or
 * entity's `translation[]`. Framework-agnostic plain data — render it however
 * you like.
 */
export interface FlyoLanguageLink {
  /** Locale shortcode, e.g. `"de"`. */
  shortcode: string;
  /** Full language name from the CMS translation, e.g. `"Deutsch"` (when available). */
  name?: string;
  /** Fully-resolved localized href, or `null` when this locale has no linked translation. */
  href: string | null;
  /** Localized page/entity title, when available. */
  title?: string;
  /** `true` when this entry is the currently active locale. */
  isCurrent: boolean;
  /** `true` when a linked translation actually exists for this locale. */
  exists: boolean;
}

/**
 * Map a page's or entity's `translation[]` into a switcher-ready array of typed
 * links — the building block for a language switcher.
 *
 * Flyo only returns `translation` entries for languages that actually have a
 * translation. Pass `options.locales` (e.g. `flyo.state.locales`) to also get an
 * entry for every configured locale that is *missing* a translation — those come
 * back as `{ href: null, exists: false }` so you can render a fallback (a disabled
 * item, a link to the home page, …).
 *
 * Pure — no React or server-only APIs, so it is safe to call from server *or*
 * client components.
 *
 * This is a pure *data* helper — it maps a `translation[]` to switcher links and
 * renders nothing. **The Flyo route helpers already call it for you and publish
 * the result**, so page and entity routes need no switcher code at all; the
 * footer just reads the store (see `publishLanguageLinks` / `readLanguageLinks`
 * in `@flyo/nitro-next/server`). Call this directly only when you publish links
 * by hand from a raw `translation[]` — e.g. on a custom route Flyo doesn't
 * resolve:
 *
 * ```tsx
 * getLanguageLinks(translations, { currentLang, locales });
 * ```
 *
 * **Render each link as a native `<a>`, not `next/link`'s `<Link>`.** A language
 * switch must refresh the shared chrome — the localized nav, footer and
 * `<html lang>` — that lives in the root layout. In the Next.js App Router, soft
 * (client-side) navigation re-renders only the page segment, *not* shared
 * layouts, so a `<Link>` would leave that chrome in the previous language while
 * only the page body updates. A plain `<a>` triggers a full-document navigation,
 * forcing a fresh server render in the new locale so every part updates. (Regular
 * nav links can stay `<Link>` — the nav is identical within a language.)
 *
 * @example
 * ```tsx
 * const links = getLanguageLinks(page.translation, {
 *   currentLang: lang,
 *   locales: flyo.state.locales,
 * });
 * // Native <a> (full-document nav) — NOT next/link, so shared layout chrome
 * // re-renders in the new locale.
 * // links.map(l => l.exists
 * //   ? <a key={l.shortcode} href={l.href!} aria-current={l.isCurrent || undefined}>{l.name ?? l.shortcode}</a>
 * //   : <span key={l.shortcode} aria-disabled>{l.shortcode}</span>)
 * ```
 */
export function getLanguageLinks(
  translations: Translation[] | undefined,
  options?: { currentLang?: string; locales?: string[] },
): FlyoLanguageLink[] {
  const currentLang = options?.currentLang;

  const byShortcode = new Map<string, Translation>();
  for (const t of translations ?? []) {
    const shortcode = t.language?.shortcode;
    if (shortcode) {
      byShortcode.set(shortcode, t);
    }
  }

  const toLink = (shortcode: string, t: Translation | undefined): FlyoLanguageLink => ({
    shortcode,
    name: t?.language?.name,
    href: t?.href ?? null,
    title: t?.title,
    isCurrent: shortcode === currentLang,
    exists: t?.href != null,
  });

  // When the full set of locales is known, emit an entry for every one so
  // callers can render fallbacks for languages that have no translation.
  if (options?.locales && options.locales.length > 0) {
    return options.locales.map((shortcode) => toLink(shortcode, byShortcode.get(shortcode)));
  }

  // Otherwise, just surface the translations that exist.
  return (translations ?? [])
    .filter((t) => t.language?.shortcode)
    .map((t) => toLink(t.language!.shortcode!, t));
}

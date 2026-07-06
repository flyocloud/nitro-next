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
 * @example
 * ```tsx
 * const links = getLanguageLinks(page.translation, {
 *   currentLang: lang,
 *   locales: flyo.state.locales,
 * });
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

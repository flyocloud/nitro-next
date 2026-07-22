import { readLanguageLinks } from '@flyo/nitro-next/server';

/**
 * Language switcher for the footer (shared chrome).
 *
 * The links are resolved by the active route — the catch-all page route and the
 * entity detail route publish them automatically (via `pageResolveRoute` /
 * `nitroEntityRoute`), including a fallback before every `notFound()`, so real
 * 404s settle the store too. Only custom routes Flyo doesn't resolve publish a
 * fallback themselves (never `not-found.tsx`). This server component just awaits
 * whatever was published.
 *
 * Rendered inside `<Suspense>` in the root layout, so the rest of the layout can
 * stream while this waits for the active route to publish.
 */
export async function LanguageSwitcher() {
  const links = await readLanguageLinks();

  // Empty only on a single-language site (no `locales` configured). With i18n on,
  // every route publishes one entry per locale, so this branch never hits and the
  // full switcher renders below. Returning null hides the switcher; if you'd
  // rather always show something, render default locale-root links here instead —
  // e.g. flyo.state.locales.map((l) => <a href={`/${l}`}>{l}</a>) for /de, /en, …
  if (links.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Language" className="mt-8 border-t pt-4">
      <ul className="flex gap-4">
        {links.map((l) =>
          l.exists ? (
            <li key={l.shortcode}>
              {/* Native <a>, NOT next/link — a language switch must refresh the
                  shared chrome (nav, footer, <html lang>) via a full navigation. */}
              <a
                href={l.href!}
                aria-current={l.isCurrent ? 'true' : undefined}
                className={l.isCurrent ? 'font-bold underline' : 'hover:underline'}
              >
                {l.name ?? l.shortcode}
              </a>
            </li>
          ) : (
            <li key={l.shortcode} aria-disabled className="text-gray-400">
              {l.shortcode}
            </li>
          ),
        )}
      </ul>
    </nav>
  );
}

/**
 * Tests for the client half of the language-switcher bridge:
 * `NitroLanguageLinksPublisher` + `useLanguageLinks`.
 *
 * The scenario under test is the v2.2 regression: a switcher in the root layout
 * is NOT re-rendered by App Router soft navigation, so it must update from the
 * client-side store the active route's publisher writes into. Navigation is
 * simulated the way it behaves in the browser: `usePathname()` changes and the
 * page segment (the publisher) re-renders, while the switcher component
 * instance (the layout) persists across `rerender()` calls.
 *
 * The store is module-level by design; every test uses its own unique pathnames
 * so state left behind by earlier tests stays inert (the hook ignores publishes
 * for other pathnames).
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { TextEncoder as NodeTextEncoder } from 'util';
import {
  NitroLanguageLinksPublisher,
  NitroLanguageSwitcherClient,
  useLanguageLinks,
  type FlyoLanguageLink,
} from './client';
import { usePathname } from 'next/navigation';

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(() => '/'),
}));

jest.mock('@flyo/nitro-js-bridge', () => ({
  highlightAndClick: jest.fn(),
  wysiwyg: jest.fn(() => ''),
  reload: jest.fn(),
  scrollTo: jest.fn(),
}));

const setPathname = (pathname: string) =>
  (usePathname as jest.Mock).mockReturnValue(pathname);

const link = (shortcode: string, href: string, isCurrent = false): FlyoLanguageLink => ({
  shortcode,
  name: shortcode.toUpperCase(),
  href,
  title: undefined,
  isCurrent,
  exists: true,
});

/** A minimal switcher, as a user would build it with the hook. */
function Switcher({ initial }: { initial?: FlyoLanguageLink[] }) {
  const links = useLanguageLinks(initial);
  return (
    <nav data-testid="switcher">
      {links.map((l) => (
        <a key={l.shortcode} href={l.href ?? undefined} aria-current={l.isCurrent || undefined}>
          {l.shortcode}
        </a>
      ))}
    </nav>
  );
}

const switcherHrefs = () =>
  Array.from(screen.getByTestId('switcher').querySelectorAll('a')).map((a) =>
    a.getAttribute('href'),
  );

describe('useLanguageLinks (first, server-rendered load)', () => {
  it('returns the initial (server-resolved) links before anything publishes', () => {
    setPathname('/t1/de/home');
    render(<Switcher initial={[link('de', '/t1/de/home', true), link('en', '/t1/en/home')]} />);
    expect(switcherHrefs()).toEqual(['/t1/de/home', '/t1/en/home']);
  });

  it('returns an empty list when there is no initial value and nothing publishes', () => {
    setPathname('/t2/de/home');
    render(<Switcher />);
    expect(switcherHrefs()).toEqual([]);
  });

  it('prefers the published links over the initial value on the same pathname', () => {
    setPathname('/t3/de/home');
    render(
      <>
        <NitroLanguageLinksPublisher links={[link('de', '/t3/de/home', true), link('en', '/t3/en/home')]} />
        <Switcher initial={[link('de', '/t3/stale', true)]} />
      </>,
    );
    expect(switcherHrefs()).toEqual(['/t3/de/home', '/t3/en/home']);
  });
});

describe('useLanguageLinks (soft navigation — the v2.2 regression)', () => {
  it('updates the persistent switcher when navigating to a page that publishes new links', () => {
    // Hard load on /t4/de/erleben: route publishes, layout switcher shows it.
    setPathname('/t4/de/erleben');
    const { rerender } = render(
      <>
        <NitroLanguageLinksPublisher
          links={[link('de', '/t4/de/erleben', true), link('en', '/t4/en/experience')]}
        />
        <Switcher initial={[link('de', '/t4/de/erleben', true), link('en', '/t4/en/experience')]} />
      </>,
    );
    expect(switcherHrefs()).toEqual(['/t4/de/erleben', '/t4/en/experience']);

    // Soft navigation to /t4/de/kontakt: the new page segment renders a new
    // publisher; the switcher instance persists (same element, no remount).
    setPathname('/t4/de/kontakt');
    rerender(
      <>
        <NitroLanguageLinksPublisher
          links={[link('de', '/t4/de/kontakt', true), link('en', '/t4/en/contact')]}
        />
        <Switcher initial={[link('de', '/t4/de/erleben', true), link('en', '/t4/en/experience')]} />
      </>,
    );
    expect(switcherHrefs()).toEqual(['/t4/de/kontakt', '/t4/en/contact']);
  });

  it('returns an empty list on a route that publishes nothing', () => {
    setPathname('/t5/de/erleben');
    const { rerender } = render(
      <>
        <NitroLanguageLinksPublisher
          links={[link('de', '/t5/de/erleben', true), link('en', '/t5/en/experience')]}
        />
        <Switcher />
      </>,
    );
    expect(switcherHrefs()).toEqual(['/t5/de/erleben', '/t5/en/experience']);

    // Soft navigation to a custom route without a publisher: showing the
    // previous page's links would switch the visitor to the wrong page. The
    // hook returns raw store data — the `default` handling lives in the
    // switcher, tested below. ({null} keeps the component in the same tree
    // position, like the real layout, where it never remounts.)
    setPathname('/t5/imprint');
    rerender(
      <>
        {null}
        <Switcher />
      </>,
    );
    expect(switcherHrefs()).toEqual([]);
  });

  it('falls back to the initial links again when returning to the initial pathname', () => {
    setPathname('/t6/de/home');
    const initial = [link('de', '/t6/de/home', true), link('en', '/t6/en/home')];
    const { rerender } = render(<Switcher initial={initial} />);
    expect(switcherHrefs()).toEqual(['/t6/de/home', '/t6/en/home']);

    setPathname('/t6/somewhere-else');
    rerender(<Switcher initial={initial} />);
    expect(switcherHrefs()).toEqual([]);

    // Back/forward to the document's original pathname: initial is valid again.
    setPathname('/t6/de/home');
    rerender(<Switcher initial={initial} />);
    expect(switcherHrefs()).toEqual(['/t6/de/home', '/t6/en/home']);
  });

  it('re-publishes when the publisher receives new links on the same pathname', () => {
    setPathname('/t7/de/page');
    const { rerender } = render(
      <>
        <NitroLanguageLinksPublisher links={[link('de', '/t7/v1', true)]} />
        <Switcher />
      </>,
    );
    expect(switcherHrefs()).toEqual(['/t7/v1']);

    rerender(
      <>
        <NitroLanguageLinksPublisher links={[link('de', '/t7/v2', true)]} />
        <Switcher />
      </>,
    );
    expect(switcherHrefs()).toEqual(['/t7/v2']);
  });

  it('works under React.StrictMode (double-invoked effects are idempotent)', () => {
    setPathname('/t8/de/page');
    render(
      <React.StrictMode>
        <NitroLanguageLinksPublisher links={[link('de', '/t8/de/page', true), link('en', '/t8/en/page')]} />
        <Switcher />
      </React.StrictMode>,
    );
    expect(switcherHrefs()).toEqual(['/t8/de/page', '/t8/en/page']);
  });
});

describe('NitroLanguageSwitcherClient (the switcher rendered by NitroLanguageSwitcher)', () => {
  // The developer's switcher definition: locale set, display order, labels.
  // Deliberately en-first while routes publish de-first — the default's order
  // must win.
  const DEFAULTS = [
    { shortcode: 'en', name: 'English', href: '/en' },
    { shortcode: 'de', name: 'Deutsch', href: '/' },
  ];

  const navLinks = () =>
    Array.from(
      screen.getByRole('navigation', { name: 'Language' }).querySelectorAll('a'),
    ).map((a) => ({
      label: a.textContent,
      href: a.getAttribute('href'),
      current: a.getAttribute('aria-current') === 'true',
    }));

  it('renders the default entries in their order, with published hrefs merged in', () => {
    setPathname('/b1/de/erleben');
    render(
      <>
        <NitroLanguageLinksPublisher
          links={[
            { shortcode: 'de', name: 'CMS-DE', href: '/b1/de/erleben', isCurrent: true, exists: true },
            { shortcode: 'en', name: 'CMS-EN', href: '/b1/en/experience', isCurrent: false, exists: true },
          ]}
        />
        <NitroLanguageSwitcherClient initial={[]} default={DEFAULTS} />
      </>,
    );

    // Order + labels come from `default`; hrefs + current flag from the route.
    expect(navLinks()).toEqual([
      { label: 'English', href: '/b1/en/experience', current: false },
      { label: 'Deutsch', href: '/b1/de/erleben', current: true },
    ]);
  });

  it('links a locale the route has no translation for to its default href', () => {
    setPathname('/b2/de/only');
    render(
      <>
        <NitroLanguageLinksPublisher
          links={[
            { shortcode: 'de', href: '/b2/de/only', isCurrent: true, exists: true },
            { shortcode: 'en', href: null, isCurrent: false, exists: false },
          ]}
        />
        <NitroLanguageSwitcherClient initial={[]} default={DEFAULTS} />
      </>,
    );

    expect(navLinks()).toEqual([
      { label: 'English', href: '/en', current: false }, // no translation → default href
      { label: 'Deutsch', href: '/b2/de/only', current: true },
    ]);
  });

  it('renders the defaults verbatim on a route that publishes nothing', () => {
    setPathname('/b3/imprint');
    render(<NitroLanguageSwitcherClient initial={[]} default={DEFAULTS} />);

    expect(navLinks()).toEqual([
      { label: 'English', href: '/en', current: false },
      { label: 'Deutsch', href: '/', current: false },
    ]);
  });

  it('ignores published locales that are not in `default`', () => {
    setPathname('/b4/de/page');
    render(
      <>
        <NitroLanguageLinksPublisher
          links={[link('de', '/b4/de/page', true), link('fr', '/b4/fr/page')]}
        />
        <NitroLanguageSwitcherClient initial={[]} default={DEFAULTS} />
      </>,
    );

    expect(navLinks().map((l) => l.label)).toEqual(['English', 'Deutsch']);
  });

  it('renders a custom component with the merged links (incl. exists flags)', () => {
    setPathname('/b5/de/page');
    const Custom = ({ links }: { links: FlyoLanguageLink[] }) => (
      <div data-testid="custom">
        {links.map((l) => `${l.shortcode}:${l.href}:${l.exists ? 'real' : 'default'}`).join(' ')}
      </div>
    );

    render(
      <>
        <NitroLanguageLinksPublisher
          links={[{ shortcode: 'de', href: '/b5/de/page', isCurrent: true, exists: true }]}
        />
        <NitroLanguageSwitcherClient initial={[]} default={DEFAULTS} component={Custom} />
      </>,
    );

    expect(screen.getByTestId('custom')).toHaveTextContent('en:/en:default de:/b5/de/page:real');
  });

  it('falls back to the defaults on a silent route mid-session, and recovers', () => {
    setPathname('/b6/de/erleben');
    const { rerender } = render(
      <>
        <NitroLanguageLinksPublisher
          links={[link('de', '/b6/de/erleben', true), link('en', '/b6/en/experience')]}
        />
        <NitroLanguageSwitcherClient initial={[]} default={DEFAULTS} />
      </>,
    );
    expect(navLinks().map((l) => l.href)).toEqual(['/b6/en/experience', '/b6/de/erleben']);

    // Soft nav to a route publishing nothing ({null} keeps the switcher mounted).
    setPathname('/b6/imprint');
    rerender(
      <>
        {null}
        <NitroLanguageSwitcherClient initial={[]} default={DEFAULTS} />
      </>,
    );
    expect(navLinks().map((l) => l.href)).toEqual(['/en', '/']);

    // Soft nav to the next publishing route: real hrefs again.
    setPathname('/b6/de/kontakt');
    rerender(
      <>
        <NitroLanguageLinksPublisher
          links={[link('de', '/b6/de/kontakt', true), link('en', '/b6/en/contact')]}
        />
        <NitroLanguageSwitcherClient initial={[]} default={DEFAULTS} />
      </>,
    );
    expect(navLinks().map((l) => l.href)).toEqual(['/b6/en/contact', '/b6/de/kontakt']);
  });
});

describe('useLanguageLinks (server rendering)', () => {
  it('renders the initial links on the server and never runs the publisher there', () => {
    setPathname('/t9/de/page');

    // Use react-dom's *node* server build: the browser build (what jest's
    // jsdom env would resolve for 'react-dom/server') schedules through a
    // module-scoped MessageChannel whose ports would keep the jest process
    // alive. jsdom still lacks TextEncoder, so polyfill that from Node.
    (globalThis as { TextEncoder?: unknown }).TextEncoder ??= NodeTextEncoder;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { renderToString } = require('react-dom/server.node') as typeof import('react-dom/server');

    // The publisher's links differ from `initial` on purpose: the SSR output
    // must contain `initial` (the server store's value, passed down as a prop),
    // because effects — and therefore publishes — never run on the server.
    const html = renderToString(
      <>
        <NitroLanguageLinksPublisher links={[link('de', '/t9/from-publisher', true)]} />
        <Switcher initial={[link('de', '/t9/from-initial', true)]} />
      </>,
    );
    expect(html).toContain('/t9/from-initial');
    expect(html).not.toContain('/t9/from-publisher');

    // Nothing leaked into the client store: a fresh client render on the same
    // pathname still resolves to its own initial value, not the SSR publisher's.
    render(<Switcher initial={[link('de', '/t9/fresh-initial', true)]} />);
    expect(switcherHrefs()).toEqual(['/t9/fresh-initial']);
  });
});

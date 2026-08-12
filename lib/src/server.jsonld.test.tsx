/**
 * JSON-LD structured data: pages and entity details both emit their `jsonld`
 * document automatically — `NitroPage` for the page's (`WebPage`, …) and
 * `nitroEntityRoute` for the entity's — so a project gets structured data
 * without wiring a component by hand.
 *
 * Two API details drive most of these tests:
 *
 * - "no document" arrives as an *empty container*, not `null`: the pages
 *   endpoint sends `{}`, the entities endpoint `[]`. Both are truthy, so a
 *   plain falsy check would ship `<script>{}</script>` on every page.
 * - A project written against an earlier version still renders
 *   `<NitroEntityJsonLd />` inside its entity `render`. That is the *same*
 *   document the route now emits, so it must not appear twice.
 *
 * At runtime Next.js scopes React `cache()` per request, which is what keeps
 * that de-duplication from leaking between requests. Jest has no request scope,
 * so jest.setup.js stands in for `cache()` with a memoizer created per module
 * load — hence `loadServer()` below, which gives every test its own module
 * instance and therefore its own per-"request" claim set.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import type { Entity, Page } from '@flyo/nitro-typescript';

jest.mock('@flyo/nitro-js-bridge', () => ({
  highlightAndClick: jest.fn(),
  wysiwyg: jest.fn(() => ''),
  reload: jest.fn(),
  scrollTo: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  usePathname: jest.fn(() => '/'),
}));

jest.mock('next/headers', () => ({
  headers: jest.fn(async () => ({ get: () => null })),
}));

jest.mock('@flyo/nitro-typescript', () => ({
  Configuration: jest.fn().mockImplementation((config) => ({ ...config })),
  ConfigApi: jest.fn(),
  PagesApi: jest.fn(),
  EntitiesApi: jest.fn(),
  SitemapApi: jest.fn(),
  SearchApi: jest.fn(),
}));

function loadServer() {
  let mod!: typeof import('./server');
  jest.isolateModules(() => {
    mod = require('./server');
  });
  return mod;
}

/** Every JSON-LD script in the rendered output, in document order. */
function jsonLdScripts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('script[type="application/ld+json"]')).map(
    (script) => script.innerHTML,
  );
}

const WEB_PAGE = { '@context': 'https://schema.org', '@type': 'WebPage', name: 'About Us' };
const THING = { '@context': 'https://schema.org', '@type': 'Thing', name: 'News #1' };

describe('NitroPage renders the page JSON-LD document', () => {
  it('emits the page document as an ld+json script', () => {
    const mod = loadServer();
    const flyo = mod.initNitro({ accessToken: 't' });
    const page = { title: 'About', json: [], jsonld: WEB_PAGE } as unknown as Page;

    const { container } = render(<mod.NitroPage page={page} flyo={flyo} />);

    expect(jsonLdScripts(container)).toEqual([JSON.stringify(WEB_PAGE)]);
  });

  it('emits nothing for the empty object the API sends when no document is set', () => {
    const mod = loadServer();
    const flyo = mod.initNitro({ accessToken: 't' });
    const page = { title: 'About', json: [], jsonld: {} } as unknown as Page;

    const { container } = render(<mod.NitroPage page={page} flyo={flyo} />);

    expect(jsonLdScripts(container)).toEqual([]);
  });

  it('emits the document for a page without blocks — it describes the page, not its content', () => {
    const mod = loadServer();
    const flyo = mod.initNitro({ accessToken: 't' });
    const page = { title: 'About', jsonld: WEB_PAGE } as unknown as Page;

    const { container } = render(<mod.NitroPage page={page} flyo={flyo} />);

    expect(jsonLdScripts(container)).toEqual([JSON.stringify(WEB_PAGE)]);
  });

  it('still renders blocks alongside the document', () => {
    const mod = loadServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const TestBlock = ({ block }: { block: any }) => <div>{block.content}</div>;
    const flyo = mod.initNitro({ accessToken: 't', components: { TestBlock } });
    const page = {
      json: [{ uid: '1', component: 'TestBlock', content: 'Block 1' }],
      jsonld: WEB_PAGE,
    } as unknown as Page;

    const { container, getByText } = render(<mod.NitroPage page={page} flyo={flyo} />);

    expect(getByText('Block 1')).toBeInTheDocument();
    expect(jsonLdScripts(container)).toHaveLength(1);
  });
});

describe('nitroEntityRoute renders the entity JSON-LD document', () => {
  const renderRoute = async (
    mod: typeof import('./server'),
    entity: Entity,
    render_?: (entity: Entity) => React.ReactNode,
  ) => {
    const flyo = mod.initNitro({ accessToken: 't' });
    const route = mod.nitroEntityRoute(flyo, { resolver: async () => entity, render: render_ });
    return render(await route({ params: Promise.resolve({}) }));
  };

  it('emits the entity document without any component in the render function', async () => {
    const mod = loadServer();
    const entity = { entity: { entity_title: 'News #1' }, jsonld: THING } as unknown as Entity;

    const { container } = await renderRoute(mod, entity, (e) => <h1>{e.entity?.entity_title}</h1>);

    expect(container.querySelector('h1')).toHaveTextContent('News #1');
    expect(jsonLdScripts(container)).toEqual([JSON.stringify(THING)]);
  });

  it('emits nothing for the empty array the API sends when no document is set', async () => {
    const mod = loadServer();
    const entity = { entity: { entity_title: 'News #1' }, jsonld: [] } as unknown as Entity;

    const { container } = await renderRoute(mod, entity);

    expect(jsonLdScripts(container)).toEqual([]);
  });

  it('emits the document only once when the render function also renders NitroEntityJsonLd', async () => {
    const mod = loadServer();
    const entity = { entity: { entity_title: 'News #1' }, jsonld: THING } as unknown as Entity;

    // What projects written against earlier versions look like: the component
    // wired up by hand. The route now emits the same document itself.
    const { container } = await renderRoute(mod, entity, (e) => (
      <>
        <mod.NitroEntityJsonLd entity={e} />
        <h1>{e.entity?.entity_title}</h1>
      </>
    ));

    expect(jsonLdScripts(container)).toEqual([JSON.stringify(THING)]);
  });

  it('emits a second, different document the project adds itself', async () => {
    const mod = loadServer();
    const entity = { entity: { entity_title: 'News #1' }, jsonld: THING } as unknown as Entity;
    const breadcrumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList' };

    const { container } = await renderRoute(mod, entity, () => (
      <mod.NitroJsonLd data={breadcrumbs} />
    ));

    expect(jsonLdScripts(container)).toEqual([
      JSON.stringify(THING),
      JSON.stringify(breadcrumbs),
    ]);
  });
});

describe('NitroJsonLd', () => {
  it('keeps a non-empty array — JSON-LD allows a list of nodes', () => {
    const mod = loadServer();
    const nodes = [THING, WEB_PAGE];

    const { container } = render(<mod.NitroJsonLd data={nodes} />);

    expect(jsonLdScripts(container)).toEqual([JSON.stringify(nodes)]);
  });

  it('renders nothing for undefined, an empty object or an empty array', () => {
    const mod = loadServer();

    const { container } = render(
      <>
        <mod.NitroJsonLd data={undefined} />
        <mod.NitroJsonLd data={{}} />
        <mod.NitroJsonLd data={[]} />
      </>,
    );

    expect(jsonLdScripts(container)).toEqual([]);
  });

  it('escapes `<` so a document cannot close the script tag', () => {
    const mod = loadServer();
    const data = { '@type': 'Thing', description: '</script><script>alert(1)</script>' };

    const { container } = render(<mod.NitroJsonLd data={data} />);

    const [script] = jsonLdScripts(container);
    expect(script).not.toContain('</script>');
    expect(script).toContain('\\u003c/script');
    // …and it is still valid JSON carrying the original text.
    expect(JSON.parse(script)).toEqual(data);
  });

  it('parses a document delivered as a JSON string', () => {
    const mod = loadServer();

    const { container } = render(<mod.NitroJsonLd data={JSON.stringify(THING)} />);

    expect(jsonLdScripts(container)).toEqual([JSON.stringify(THING)]);
  });

  it('renders nothing for a string that is not JSON', () => {
    const mod = loadServer();

    const { container } = render(<mod.NitroJsonLd data="not json" />);

    expect(jsonLdScripts(container)).toEqual([]);
  });
});

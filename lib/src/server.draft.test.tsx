import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { initNitro, nitroEntityRoute, NitroDraftNotice, type EntityResolver } from './server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Entity } from '@flyo/nitro-typescript';
import { withDraftMarker, hasDraftMarker, DEFAULT_DRAFT_URL_MARKER } from './draft';

// ./client (pulled in by the language-links publisher) reaches for the real
// js-bridge; keep it out of the jsdom run.
jest.mock('@flyo/nitro-js-bridge', () => ({
  highlightAndClick: jest.fn(),
  wysiwyg: jest.fn(() => ''),
  reload: jest.fn(),
  scrollTo: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('Not Found');
  }),
  // The real `redirect()` throws too, which is how it unwinds the render.
  redirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  usePathname: jest.fn(() => '/'),
}));

// Request headers the mocked `headers()` hands back; each test sets its own.
let mockRequestHeaders: Record<string, string> | null = {};

jest.mock('next/headers', () => ({
  headers: jest.fn(async () => {
    // Outside a request scope the real `headers()` throws — `null` models that.
    if (mockRequestHeaders === null) {
      throw new Error('`headers` was called outside a request scope.');
    }
    const store = mockRequestHeaders;
    return { get: (key: string) => store[key.toLowerCase()] ?? null };
  }),
}));

jest.mock('@flyo/nitro-typescript', () => ({
  Configuration: jest.fn().mockImplementation((config) => ({ ...config })),
  ConfigApi: jest.fn().mockImplementation(() => ({
    config: jest.fn().mockResolvedValue({ pages: [] }),
  })),
  PagesApi: jest.fn().mockImplementation(() => ({ page: jest.fn() })),
  EntitiesApi: jest.fn().mockImplementation(() => ({})),
  SitemapApi: jest.fn().mockImplementation(() => ({})),
  SearchApi: jest.fn().mockImplementation(() => ({})),
}));

const PUBLISHED: Entity = {
  entity: { entity_title: 'Published entity' },
  is_draft: false,
  draft_expires_at: null,
};

const DRAFT: Entity = {
  entity: { entity_title: 'Draft entity' },
  is_draft: true,
  // 2034-01-01T00:00:00Z
  draft_expires_at: 2019686400,
};

/** Render an entity route and hand back the redirect it triggered, if any. */
async function renderRoute(
  flyo: ReturnType<typeof initNitro>,
  entity: Entity,
  options: { draftNotice?: boolean } = {},
): Promise<string | undefined> {
  const resolver: EntityResolver<{ slug: string }> = async () => entity;
  const route = nitroEntityRoute(flyo, { resolver, ...options });

  try {
    const element = await route({ params: Promise.resolve({ slug: 'token' }) });
    render(element as React.ReactElement);
    return undefined;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith('NEXT_REDIRECT:')) {
      return message.slice('NEXT_REDIRECT:'.length);
    }
    throw error;
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequestHeaders = {};
});

describe('draftUrlMarker configuration', () => {
  it('defaults to the shared marker name', () => {
    expect(initNitro({ accessToken: 't' }).state.draftUrlMarker).toBe(DEFAULT_DRAFT_URL_MARKER);
    expect(DEFAULT_DRAFT_URL_MARKER).toBe('flyo-draft');
  });

  it('takes a custom parameter name', () => {
    expect(initNitro({ accessToken: 't', draftUrlMarker: 'preview' }).state.draftUrlMarker).toBe('preview');
  });

  it('is null when marking is switched off', () => {
    expect(initNitro({ accessToken: 't', draftUrlMarker: false }).state.draftUrlMarker).toBeNull();
  });
});

describe('withDraftMarker', () => {
  it('appends the marker to a bare path', () => {
    expect(withDraftMarker('/tiere/token', 'flyo-draft')).toBe('/tiere/token?flyo-draft=1');
  });

  it('keeps query parameters that are already there', () => {
    expect(withDraftMarker('/tiere/token?utm_source=mail', 'flyo-draft')).toBe(
      '/tiere/token?utm_source=mail&flyo-draft=1',
    );
  });

  it('is a no-op once the marker is set, so it cannot build a redirect loop', () => {
    const marked = withDraftMarker('/tiere/token', 'flyo-draft');
    expect(withDraftMarker(marked, 'flyo-draft')).toBe(marked);
  });
});

describe('hasDraftMarker', () => {
  it('matches only the exact marker value', () => {
    expect(hasDraftMarker(new URLSearchParams('flyo-draft=1'), 'flyo-draft')).toBe(true);
    expect(hasDraftMarker(new URLSearchParams('flyo-draft=yes'), 'flyo-draft')).toBe(false);
    expect(hasDraftMarker(new URLSearchParams(''), 'flyo-draft')).toBe(false);
  });

  it('never matches when marking is switched off', () => {
    expect(hasDraftMarker(new URLSearchParams('flyo-draft=1'), null)).toBe(false);
  });
});

describe('draft entities and caching', () => {
  it('redirects an unmarked draft onto the marker the proxy reads', async () => {
    mockRequestHeaders = { 'x-flyo-path': '/tiere/token' };

    const flyo = initNitro({ accessToken: 't' });

    expect(await renderRoute(flyo, DRAFT)).toBe('/tiere/token?flyo-draft=1');
    expect(redirect).toHaveBeenCalledTimes(1);
  });

  it('carries existing query parameters through the redirect', async () => {
    mockRequestHeaders = { 'x-flyo-path': '/tiere/token?ref=newsletter' };

    expect(await renderRoute(initNitro({ accessToken: 't' }), DRAFT)).toBe(
      '/tiere/token?ref=newsletter&flyo-draft=1',
    );
  });

  it('uses a custom marker name', async () => {
    mockRequestHeaders = { 'x-flyo-path': '/tiere/token' };

    expect(await renderRoute(initNitro({ accessToken: 't', draftUrlMarker: 'preview' }), DRAFT)).toBe(
      '/tiere/token?preview=1',
    );
  });

  it('renders instead of redirecting once the proxy has seen the marker', async () => {
    mockRequestHeaders = { 'x-flyo-path': '/tiere/token?flyo-draft=1', 'x-flyo-draft': '1' };

    expect(await renderRoute(initNitro({ accessToken: 't' }), DRAFT)).toBeUndefined();
    expect(redirect).not.toHaveBeenCalled();
    expect(screen.getByText('Draft entity')).toBeInTheDocument();
  });

  it('does not redirect a URL that already carries the marker', async () => {
    // Belt and braces: even if the `x-flyo-draft` flag went missing on the way
    // in, the path itself says the redirect has already happened.
    mockRequestHeaders = { 'x-flyo-path': '/tiere/token?flyo-draft=1' };

    expect(await renderRoute(initNitro({ accessToken: 't' }), DRAFT)).toBeUndefined();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('does not redirect when the proxy is not in front of the route', async () => {
    // No `x-flyo-path`: there is no cache header of ours to correct, and no way
    // to learn the current URL.
    mockRequestHeaders = {};

    expect(await renderRoute(initNitro({ accessToken: 't' }), DRAFT)).toBeUndefined();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('does not redirect when draft URL marking is switched off', async () => {
    mockRequestHeaders = { 'x-flyo-path': '/tiere/token' };

    expect(await renderRoute(initNitro({ accessToken: 't', draftUrlMarker: false }), DRAFT)).toBeUndefined();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('survives being rendered outside a request scope', async () => {
    mockRequestHeaders = null;

    expect(await renderRoute(initNitro({ accessToken: 't' }), DRAFT)).toBeUndefined();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('never touches headers() for a published entity, so normal routes stay cacheable', async () => {
    mockRequestHeaders = { 'x-flyo-path': '/tiere/hund' };

    expect(await renderRoute(initNitro({ accessToken: 't' }), PUBLISHED)).toBeUndefined();
    // Reading a request header is a dynamic API — doing it unconditionally
    // would opt every entity route out of static rendering.
    expect(headers).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('treats a response without the flag as published', async () => {
    mockRequestHeaders = { 'x-flyo-path': '/tiere/hund' };

    // An older API deployment, or a hand-built fixture, simply omits `is_draft`.
    expect(await renderRoute(initNitro({ accessToken: 't' }), { entity: { entity_title: 'Legacy' } })).toBeUndefined();
    expect(headers).not.toHaveBeenCalled();
  });
});

describe('NitroDraftNotice', () => {
  it('renders nothing for a published entity', () => {
    const { container } = render(<NitroDraftNotice entity={PUBLISHED} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('names the expiry of the draft link', () => {
    render(<NitroDraftNotice entity={DRAFT} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Draft preview — this content is not published · link expires 2034-01-01 00:00 UTC',
    );
  });

  it('renders without an expiry when the timestamp is missing or unusable', () => {
    render(<NitroDraftNotice entity={{ is_draft: true, draft_expires_at: null }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Draft preview — this content is not published');
    expect(screen.getByRole('status')).not.toHaveTextContent('expires');
  });

  it('is rendered by nitroEntityRoute for a draft response', async () => {
    mockRequestHeaders = { 'x-flyo-path': '/tiere/token?flyo-draft=1', 'x-flyo-draft': '1' };

    await renderRoute(initNitro({ accessToken: 't' }), DRAFT);
    expect(screen.getByRole('status')).toHaveTextContent('Draft preview');
  });

  it('is suppressed by draftNotice: false', async () => {
    mockRequestHeaders = { 'x-flyo-path': '/tiere/token?flyo-draft=1', 'x-flyo-draft': '1' };

    await renderRoute(initNitro({ accessToken: 't' }), DRAFT, { draftNotice: false });
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('Draft entity')).toBeInTheDocument();
  });

  it('is not rendered for a published entity', async () => {
    await renderRoute(initNitro({ accessToken: 't' }), PUBLISHED);
    expect(screen.queryByRole('status')).toBeNull();
  });
});

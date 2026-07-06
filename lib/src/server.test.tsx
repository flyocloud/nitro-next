import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import {
  initNitro,
  NitroPage,
  NitroBlock,
  NitroSlot,
  NitroDebugInfo,
  nitroPageRoute,
  nitroPageGenerateMetadata,
  nitroPageGenerateStaticParams,
  nitroEntityRoute,
  nitroEntityGenerateMetadata,
  getLanguageLinks,
  type FlyoInstance,
} from './server';
import { headers } from 'next/headers';
import { Configuration, ConfigApi, PagesApi, Page, Block, Entity } from '@flyo/nitro-typescript';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('Not Found');
  }),
}));

// Mock next/headers (only available inside a Next.js request scope)
jest.mock('next/headers', () => ({
  headers: jest.fn(async () => ({ get: () => null })),
}));

// Mock @flyo/nitro-typescript
jest.mock('@flyo/nitro-typescript', () => {
  return {
    Configuration: jest.fn().mockImplementation((config) => ({
      ...config,
      apiKey: config.apiKey
    })),
    ConfigApi: jest.fn().mockImplementation(() => ({
      config: jest.fn().mockResolvedValue({ 
        title: 'Mock Config',
        pages: ['', 'about', 'blog/post-1']
      }),
    })),
    PagesApi: jest.fn().mockImplementation(() => ({
      page: jest.fn().mockImplementation(({ slug }: { slug: string }) => {
        if (slug === 'about') {
          return Promise.resolve({
            title: 'About Page',
            meta_json: {
              title: 'About Us',
              description: 'Learn about us',
              image: 'https://example.com/about.jpg'
            },
            json: []
          });
        }
        return Promise.reject(new Error('Page not found'));
      })
    })),
    EntitiesApi: jest.fn().mockImplementation(() => ({
      entityBySlug: jest.fn().mockImplementation(({ slug, typeId }: { slug: string; typeId?: number }) => {
        if (slug === 'test-entity' && typeId === 123) {
          return Promise.resolve({
            entity: {
              entity_title: 'Test Entity',
              entity_teaser: 'Test entity description'
            }
          });
        }
        return Promise.reject(new Error('Entity not found'));
      }),
      entityByUniqueid: jest.fn().mockImplementation(({ uniqueid }: { uniqueid: string }) => {
        if (uniqueid === 'unique-123') {
          return Promise.resolve({
            entity: {
              entity_title: 'Unique Entity',
              entity_teaser: 'Unique entity description'
            }
          });
        }
        return Promise.reject(new Error('Entity not found'));
      })
    })),
  };
});

describe('initNitro', () => {
  it('initializes configuration with access token', () => {
    const accessToken = 'test-token';
    initNitro({ accessToken });
    expect(Configuration).toHaveBeenCalledWith({ apiKey: accessToken });
  });

  it('returns a FlyoInstance with all expected methods', () => {
    const flyo = initNitro({ accessToken: 'test-token' });
    expect(flyo.state).toBeDefined();
    expect(flyo.state.accessToken).toBe('test-token');
    expect(typeof flyo.getNitroConfig).toBe('function');
    expect(typeof flyo.getNitroPages).toBe('function');
    expect(typeof flyo.getNitroEntities).toBe('function');
    expect(typeof flyo.getNitroSitemap).toBe('function');
    expect(typeof flyo.getNitroSearch).toBe('function');
    expect(typeof flyo.pageResolveRoute).toBe('function');
    expect(typeof flyo.sitemap).toBe('function');
  });

  it('applies default values for optional config', () => {
    const flyo = initNitro({ accessToken: 'test' });
    expect(flyo.state.lang).toBeNull();
    expect(flyo.state.baseUrl).toBeNull();
    expect(flyo.state.components).toEqual({});
    expect(flyo.state.showMissingComponentAlert).toBe(false);
    expect(flyo.state.liveEdit).toBe(false);
    expect(flyo.state.serverCacheTtl).toBe(1200);
    expect(flyo.state.clientCacheTtl).toBe(900);
  });

  it('sets showMissingComponentAlert from liveEdit when not explicitly set', () => {
    const flyo = initNitro({ accessToken: 'test', liveEdit: true });
    expect(flyo.state.showMissingComponentAlert).toBe(true);
  });

  it('defaults defaultLocale and locales from lang', () => {
    const flyo = initNitro({ accessToken: 'test', lang: 'de' });
    expect(flyo.state.defaultLocale).toBe('de');
    expect(flyo.state.locales).toEqual(['de']);
  });

  it('uses explicit locales and defaultLocale', () => {
    const flyo = initNitro({ accessToken: 'test', defaultLocale: 'de', locales: ['de', 'en'] });
    expect(flyo.state.defaultLocale).toBe('de');
    expect(flyo.state.locales).toEqual(['de', 'en']);
  });

  it('has empty locales and null defaultLocale when neither lang nor locales are set', () => {
    const flyo = initNitro({ accessToken: 'test' });
    expect(flyo.state.defaultLocale).toBeNull();
    expect(flyo.state.locales).toEqual([]);
  });
});

describe('flyo.getNitroConfig', () => {
  it('returns config', async () => {
    const flyo = initNitro({ accessToken: 'test-token' });
    const config = await flyo.getNitroConfig();
    expect(config).toEqual({ 
      title: 'Mock Config',
      pages: ['', 'about', 'blog/post-1']
    });
  });
});

describe('NitroPage', () => {
  it('renders nothing if page json is missing', () => {
    const flyo = initNitro({ accessToken: 'test' });
    const { container } = render(<NitroPage page={{} as Page} flyo={flyo} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders blocks', () => {
    const page = {
      json: [
        { uid: '1', component: 'TestBlock', content: 'Block 1' },
        { uid: '2', component: 'TestBlock', content: 'Block 2' },
      ],
    } as unknown as Page;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const TestBlock = ({ block }: { block: Block }) => <div>{(block as any).content}</div>;
    const flyo = initNitro({ 
        accessToken: 'test', 
        components: { TestBlock } 
    });

    render(<NitroPage page={page} flyo={flyo} />);
    expect(screen.getByText('Block 1')).toBeInTheDocument();
    expect(screen.getByText('Block 2')).toBeInTheDocument();
  });
});

describe('NitroBlock', () => {
  it('renders fallback if component not found', () => {
    const flyo = initNitro({ 
        accessToken: 'test',
        showMissingComponentAlert: true,
    });

    const block = { uid: '1', component: 'Unknown', content: 'Hidden' } as unknown as Block;
    render(<NitroBlock block={block} flyo={flyo} />);
    expect(screen.getByText((content) => content.includes('Unknown'))).toBeInTheDocument();
  });

  it('renders component if found', () => {
    const block = { uid: '1', component: 'Known', content: 'Visible' } as unknown as Block;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Known = ({ block }: { block: Block }) => <div>{(block as any).content}</div>;
    
    const flyo = initNitro({ 
        accessToken: 'test', 
        components: { Known } 
    });

    render(<NitroBlock block={block} flyo={flyo} />);
    expect(screen.getByText('Visible')).toBeInTheDocument();
  });
});

describe('NitroSlot', () => {
  let flyo: FlyoInstance;

  beforeEach(() => {
    flyo = initNitro({ 
      accessToken: 'test',
      components: {}
    });
  });

  it('renders nothing if slot is undefined', () => {
    const { container } = render(<NitroSlot slot={undefined} flyo={flyo} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing if slot has no content', () => {
    const { container } = render(<NitroSlot slot={{}} flyo={flyo} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing if slot content is not an array', () => {
    const { container } = render(<NitroSlot slot={{ content: 'invalid' as unknown as Block[] }} flyo={flyo} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nested blocks from slot content', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const TestBlock = ({ block }: { block: Block }) => <div>{(block as any).content}</div>;
    
    flyo = initNitro({ 
      accessToken: 'test',
      components: { TestBlock }
    });

    const slot = {
      content: [
        { uid: '1', component: 'TestBlock', content: 'Nested 1' },
        { uid: '2', component: 'TestBlock', content: 'Nested 2' },
      ] as unknown as Block[]
    };

    render(<NitroSlot slot={slot} flyo={flyo} />);
    expect(screen.getByText('Nested 1')).toBeInTheDocument();
    expect(screen.getByText('Nested 2')).toBeInTheDocument();
  });

  it('handles deeply nested slots recursively', () => {
    // In v2, user components that render NitroSlot must import flyo from config.
    // In tests, we simulate this via closure over the `flyo` variable.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Container = ({ block }: { block: Block }) => (
      <div>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <span>{(block as any).content}</span>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <NitroSlot slot={(block as any).slots?.nested} flyo={flyo} />
      </div>
    );
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const TextBlock = ({ block }: { block: Block }) => <p>{(block as any).content}</p>;
    
    flyo = initNitro({ 
      accessToken: 'test',
      components: { Container, TextBlock }
    });

    const slot = {
      content: [
        {
          uid: '1',
          component: 'Container',
          content: 'Parent',
          slots: {
            nested: {
              content: [
                { uid: '2', component: 'TextBlock', content: 'Child' }
              ]
            }
          }
        }
      ] as unknown as Block[]
    };

    render(<NitroSlot slot={slot} flyo={flyo} />);
    expect(screen.getByText('Parent')).toBeInTheDocument();
    expect(screen.getByText('Child')).toBeInTheDocument();
  });
});

describe('API client factories', () => {
  it('getNitroPages returns PagesApi instance', () => {
    const flyo = initNitro({ accessToken: 'test-token' });
    const api = flyo.getNitroPages();
    expect(api).toBeDefined();
    expect(typeof api.page).toBe('function');
  });

  it('getNitroEntities returns EntitiesApi instance', () => {
    const flyo = initNitro({ accessToken: 'test-token' });
    const api = flyo.getNitroEntities();
    expect(api).toBeDefined();
    expect(typeof api.entityBySlug).toBe('function');
    expect(typeof api.entityByUniqueid).toBe('function');
  });
});

describe('Page Route Factories', () => {
  let flyo: FlyoInstance;

  beforeEach(() => {
    flyo = initNitro({ accessToken: 'test-token' });
  });

  describe('nitroPageGenerateStaticParams', () => {
    it('generates static params from config pages', async () => {
      const generateStaticParams = nitroPageGenerateStaticParams(flyo);
      const params = await generateStaticParams();
      
      expect(params).toEqual([
        { slug: undefined }, // homepage
        { slug: ['about'] },
        { slug: ['blog', 'post-1'] }
      ]);
    });
  });

  describe('nitroPageGenerateMetadata', () => {
    it('generates metadata from page data', async () => {
      const generateMetadata = nitroPageGenerateMetadata(flyo);
      const metadata = await generateMetadata({
        params: Promise.resolve({ slug: ['about'] })
      });

      expect(metadata.title).toBe('About Us');
      expect(metadata.description).toBe('Learn about us');
    });

    it('throws not found for invalid page', async () => {
      const generateMetadata = nitroPageGenerateMetadata(flyo);
      await expect(
        generateMetadata({
          params: Promise.resolve({ slug: ['invalid'] })
        })
      ).rejects.toThrow('Not Found');
    });
  });

  describe('nitroPageRoute', () => {
    it('renders page component', async () => {
      const pageHandler = nitroPageRoute(flyo);
      const result = await pageHandler({
        params: Promise.resolve({ slug: ['about'] })
      });

      expect(result).toBeDefined();
    });

    it('throws not found for invalid page', async () => {
      const pageHandler = nitroPageRoute(flyo);
      await expect(
        pageHandler({
          params: Promise.resolve({ slug: ['invalid'] })
        })
      ).rejects.toThrow('Not Found');
    });
  });
});

describe('Entity Route Factories', () => {
  let flyo: FlyoInstance;

  beforeEach(() => {
    flyo = initNitro({ accessToken: 'test-token' });
  });

  describe('nitroEntityRoute', () => {
    it('renders entity with custom resolver by slug', async () => {
      const resolver = async (params: Promise<{ slug: string }>) => {
        const { slug } = await params;
        return flyo.getNitroEntities().entityBySlug({ slug, typeId: 123 });
      };

      const pageHandler = nitroEntityRoute(flyo, { 
        resolver,
        render: (entity: Entity) => <div>{entity.entity?.entity_title}</div>
      });

      const result = await pageHandler(
        { params: Promise.resolve({ slug: 'test-entity' }) }
      );

      expect(result).toBeDefined();
    });

    it('renders entity with custom resolver by uniqueid', async () => {
      const resolver = async (params: Promise<{ uniqueid: string }>) => {
        const { uniqueid } = await params;
        return flyo.getNitroEntities().entityByUniqueid({ uniqueid });
      };

      const pageHandler = nitroEntityRoute(flyo, { 
        resolver,
        render: (entity: Entity) => <div>{entity.entity?.entity_title}</div>
      });

      const result = await pageHandler(
        { params: Promise.resolve({ uniqueid: 'unique-123' }) }
      );

      expect(result).toBeDefined();
    });

    it('uses default render when no render function provided', async () => {
      const resolver = async (params: Promise<{ slug: string }>) => {
        const { slug } = await params;
        return flyo.getNitroEntities().entityBySlug({ slug, typeId: 123 });
      };

      const pageHandler = nitroEntityRoute(flyo, { resolver });

      const result = await pageHandler(
        { params: Promise.resolve({ slug: 'test-entity' }) }
      );

      expect(result).toBeDefined();
    });

    it('throws not found for invalid entity', async () => {
      const resolver = async (params: Promise<{ slug: string }>) => {
        const { slug } = await params;
        return flyo.getNitroEntities().entityBySlug({ slug, typeId: 123 });
      };

      const pageHandler = nitroEntityRoute(flyo, { resolver });

      await expect(
        pageHandler(
          { params: Promise.resolve({ slug: 'invalid-entity' }) }
        )
      ).rejects.toThrow('Entity not found');
    });
  });

  describe('nitroEntityGenerateMetadata', () => {
    it('generates metadata from entity by slug', async () => {
      const resolver = async (params: Promise<{ slug: string }>) => {
        const { slug } = await params;
        return flyo.getNitroEntities().entityBySlug({ slug, typeId: 123 });
      };

      const generateMetadata = nitroEntityGenerateMetadata(flyo, { resolver });

      const metadata = await generateMetadata(
        { params: Promise.resolve({ slug: 'test-entity' }) }
      );

      expect(metadata.title).toBe('Test Entity');
      expect(metadata.description).toBe('Test entity description');
    });

    it('generates metadata from entity by uniqueid', async () => {
      const resolver = async (params: Promise<{ uniqueid: string }>) => {
        const { uniqueid } = await params;
        return flyo.getNitroEntities().entityByUniqueid({ uniqueid });
      };

      const generateMetadata = nitroEntityGenerateMetadata(flyo, { resolver });

      const metadata = await generateMetadata(
        { params: Promise.resolve({ uniqueid: 'unique-123' }) }
      );

      expect(metadata.title).toBe('Unique Entity');
      expect(metadata.description).toBe('Unique entity description');
    });

    it('uses default title and description for missing entity data', async () => {
      const resolver = async () => {
        return Promise.resolve({ entity: {} } as Entity);
      };

      const generateMetadata = nitroEntityGenerateMetadata(flyo, { resolver });

      const metadata = await generateMetadata(
        { params: Promise.resolve({ slug: 'test' }) }
      );

      expect(metadata.title).toBe('');
      expect(metadata.description).toBe('');
    });

    it('throws not found for invalid entity', async () => {
      const resolver = async (params: Promise<{ slug: string }>) => {
        const { slug } = await params;
        return flyo.getNitroEntities().entityBySlug({ slug, typeId: 123 });
      };

      const generateMetadata = nitroEntityGenerateMetadata(flyo, { resolver });

      await expect(
        generateMetadata(
          { params: Promise.resolve({ slug: 'invalid-entity' }) }
        )
      ).rejects.toThrow('Entity not found');
    });
  });
});

describe('getLanguageLinks', () => {
  const translations = [
    { language: { shortcode: 'de', name: 'Deutsch' }, slug: 'de/x', title: 'DE', href: '/de/x' },
    { language: { shortcode: 'en', name: 'Englisch' }, slug: 'en/x', title: 'EN', href: '/en/x' },
  ];

  it('maps translations to typed links and marks the current locale', () => {
    const links = getLanguageLinks(translations, { currentLang: 'de' });
    expect(links).toEqual([
      { shortcode: 'de', name: 'Deutsch', href: '/de/x', title: 'DE', isCurrent: true, exists: true },
      { shortcode: 'en', name: 'Englisch', href: '/en/x', title: 'EN', isCurrent: false, exists: true },
    ]);
  });

  it('emits an entry per configured locale, with a fallback for missing translations', () => {
    const links = getLanguageLinks([translations[0]], { currentLang: 'de', locales: ['de', 'en', 'fr'] });
    expect(links.map((l) => [l.shortcode, l.exists, l.href])).toEqual([
      ['de', true, '/de/x'],
      ['en', false, null],
      ['fr', false, null],
    ]);
  });

  it('returns an empty array when there are no translations', () => {
    expect(getLanguageLinks(undefined)).toEqual([]);
  });
});

describe('i18n request handling', () => {
  it('getRequestLocale falls back to defaultLocale when no header is present', async () => {
    const flyo = initNitro({ accessToken: 'test', defaultLocale: 'de', locales: ['de', 'en'] });
    await expect(flyo.getRequestLocale()).resolves.toBe('de');
  });

  it('getRequestLocale reads the x-flyo-locale header', async () => {
    (headers as unknown as jest.Mock).mockResolvedValueOnce({
      get: (key: string) => (key === 'x-flyo-locale' ? 'en' : null),
    });
    const flyo = initNitro({ accessToken: 'test', defaultLocale: 'de', locales: ['de', 'en'] });
    await expect(flyo.getRequestLocale()).resolves.toBe('en');
  });

  it('pageResolveRoute returns the default locale for an unprefixed slug', async () => {
    const flyo = initNitro({ accessToken: 'test', defaultLocale: 'en', locales: ['en', 'de'] });
    const { path, lang } = await flyo.pageResolveRoute({
      params: Promise.resolve({ slug: ['about'] }),
    });
    expect(path).toBe('about');
    expect(lang).toBe('en');
  });

  it('pageResolveRoute derives the locale from a prefixed slug', async () => {
    (ConfigApi as unknown as jest.Mock).mockImplementationOnce(() => ({
      config: jest.fn().mockResolvedValue({ pages: ['de/about'] }),
    }));
    (PagesApi as unknown as jest.Mock).mockImplementationOnce(() => ({
      page: jest.fn().mockResolvedValue({ title: 'DE About', translation: [] }),
    }));
    const flyo = initNitro({ accessToken: 'test', defaultLocale: 'en', locales: ['en', 'de'] });
    const { path, lang } = await flyo.pageResolveRoute({
      params: Promise.resolve({ slug: ['de', 'about'] }),
    });
    expect(path).toBe('de/about');
    expect(lang).toBe('de');
  });
});

describe('NitroDebugInfo', () => {
  beforeEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.VERCEL_DEPLOYMENT_ID;
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    delete process.env.VERSION;
  });

  it('renders debug info with production token', async () => {
    const flyo = initNitro({ 
      accessToken: 'p-production-token',
      liveEdit: false
    });

    const element = await NitroDebugInfo({ flyo });
    const { container } = render(element);
    const html = container.innerHTML;
    
    expect(html).toContain('<!-- ');
    expect(html).toContain('liveedit:false');
    expect(html).toContain('tokentype:production');
  });

  it('renders debug info with develop token', async () => {
    const flyo = initNitro({ 
      accessToken: 'd-develop-token',
      liveEdit: true
    });

    const element = await NitroDebugInfo({ flyo });
    const { container } = render(element);
    const html = container.innerHTML;
    
    expect(html).toContain('liveedit:true');
    expect(html).toContain('tokentype:develop');
  });

  it('includes environment variables when available', async () => {
    process.env.NODE_ENV = 'production';
    process.env.VERCEL_DEPLOYMENT_ID = 'dpl_abc123';
    process.env.VERCEL_GIT_COMMIT_SHA = 'sha123abc';
    process.env.VERSION = 'v1.2.3';

    const flyo = initNitro({ 
      accessToken: 'p-token',
      liveEdit: false
    });

    const element = await NitroDebugInfo({ flyo });
    const { container } = render(element);
    const html = container.innerHTML;
    
    expect(html).toContain('env:production');
    expect(html).toContain('did:dpl_abc123');
    expect(html).toContain('csha:sha123abc');
    expect(html).toContain('release:v1.2.3');
  });

  it('formats date in de-CH locale', async () => {
    const flyo = initNitro({ 
      accessToken: 'test-token',
      liveEdit: false
    });

    const element = await NitroDebugInfo({ flyo });
    const { container } = render(element);
    const html = container.innerHTML;
    
    expect(html).toContain('versiondate:');
  });
});

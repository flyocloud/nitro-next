import React from 'react';
import '@testing-library/jest-dom'; // Add this line
import { render, screen } from '@testing-library/react';
import {
  initNitro,
  getNitroConfig,
  NitroPage,
  NitroBlock,
  NitroSlot,
  NitroDebugInfo,
  getNitroPages,
  getNitroEntities,
  nitroPageRoute,
  nitroPageGenerateMetadata,
  nitroPageGenerateStaticParams,
  nitroEntityRoute,
  nitroEntityGenerateMetadata,
  globalNitroState
} from './server';
import { Configuration, Page, Block, Entity, ConfigResponse } from '@flyo/nitro-typescript';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('Not Found');
  }),
}));

// Mock @flyo/nitro-typescript
jest.mock('@flyo/nitro-typescript', () => {
  return {
    Configuration: jest.fn().mockImplementation((config) => ({
      ...config,
      apiKey: config.apiKey // Ensure apiKey is properly stored
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
});

describe('getNitroConfig', () => {

  it('returns config', async () => {
    const config = await getNitroConfig();
    expect(config).toEqual({ 
      title: 'Mock Config',
      pages: ['', 'about', 'blog/post-1']
    });
  });
});

describe('NitroPage', () => {
  it('renders nothing if page json is missing', () => {
    const { container } = render(<NitroPage page={{} as Page} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders blocks', () => {
    const page = {
      json: [
        { uid: '1', component: 'TestBlock', content: 'Block 1' },
        { uid: '2', component: 'TestBlock', content: 'Block 2' },
      ],
    } as unknown as Page;

    // Register a component for TestBlock
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const TestBlock = ({ block }: { block: Block }) => <div>{(block as any).content}</div>;
    initNitro({ 
        accessToken: 'test', 
        components: { TestBlock } 
    });

    render(<NitroPage page={page} />);
    expect(screen.getByText('Block 1')).toBeInTheDocument();
    expect(screen.getByText('Block 2')).toBeInTheDocument();
  });
});

describe('NitroBlock', () => {
  it('renders fallback if component not found', () => {

     initNitro({ 
        showMissingComponentAlert: true,
    });

    const block = { uid: '1', component: 'Unknown', content: 'Hidden' } as unknown as Block;
    render(<NitroBlock block={block} />);
    // The fallback renders JSON
    expect(screen.getByText((content) => content.includes('Unknown'))).toBeInTheDocument();
  });

  it('renders component if found', () => {
    const block = { uid: '1', component: 'Known', content: 'Visible' } as unknown as Block;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Known = ({ block }: { block: Block }) => <div>{(block as any).content}</div>;
    
    initNitro({ 
        accessToken: 'test', 
        components: { Known } 
    });

    render(<NitroBlock block={block} />);
    expect(screen.getByText('Visible')).toBeInTheDocument();
  });
});

describe('NitroSlot', () => {
  beforeEach(() => {
    initNitro({ 
      accessToken: 'test',
      components: {}
    });
  });

  it('renders nothing if slot is undefined', () => {
    const { container } = render(<NitroSlot slot={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing if slot has no content', () => {
    const { container } = render(<NitroSlot slot={{}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing if slot content is not an array', () => {
    const { container } = render(<NitroSlot slot={{ content: 'invalid' as unknown as Block[] }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nested blocks from slot content', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const TestBlock = ({ block }: { block: Block }) => <div>{(block as any).content}</div>;
    
    initNitro({ 
      accessToken: 'test',
      components: { TestBlock }
    });

    const slot = {
      content: [
        { uid: '1', component: 'TestBlock', content: 'Nested 1' },
        { uid: '2', component: 'TestBlock', content: 'Nested 2' },
      ] as unknown as Block[]
    };

    render(<NitroSlot slot={slot} />);
    expect(screen.getByText('Nested 1')).toBeInTheDocument();
    expect(screen.getByText('Nested 2')).toBeInTheDocument();
  });

  it('handles deeply nested slots recursively', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Container = ({ block }: { block: Block }) => (
      <div>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <span>{(block as any).content}</span>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <NitroSlot slot={(block as any).slots?.nested} />
      </div>
    );
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const TextBlock = ({ block }: { block: Block }) => <p>{(block as any).content}</p>;
    
    initNitro({ 
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

    render(<NitroSlot slot={slot} />);
    expect(screen.getByText('Parent')).toBeInTheDocument();
    expect(screen.getByText('Child')).toBeInTheDocument();
  });
});

describe('Hooks', () => {
    it('getNitroPages returns PagesApi instance', () => {
        const api = getNitroPages();
        expect(api).toBeDefined();
        expect(typeof api.page).toBe('function');
    });

    it('getNitroEntities returns EntitiesApi instance', () => {
        const api = getNitroEntities();
        expect(api).toBeDefined();
        expect(typeof api.entityBySlug).toBe('function');
        expect(typeof api.entityByUniqueid).toBe('function');
    });
});

describe('Route Helpers', () => {
  beforeEach(() => {
    initNitro({ 
      accessToken: 'test-token'
    });
  });

  describe('nitroPageGenerateStaticParams', () => {
    it('generates static params from config pages', async () => {
      const params = await nitroPageGenerateStaticParams();
      
      expect(params).toEqual([
        { slug: undefined }, // homepage
        { slug: ['about'] },
        { slug: ['blog', 'post-1'] }
      ]);
    });
  });

  describe('nitroPageGenerateMetadata', () => {
    it('generates metadata from page data', async () => {
      const metadata = await nitroPageGenerateMetadata({
        params: Promise.resolve({ slug: ['about'] })
      });

      expect(metadata.title).toBe('About Us');
      expect(metadata.description).toBe('Learn about us');
    });

    it('throws not found for invalid page', async () => {
      await expect(
        nitroPageGenerateMetadata({
          params: Promise.resolve({ slug: ['invalid'] })
        })
      ).rejects.toThrow('Not Found');
    });
  });

  describe('nitroPageRoute', () => {
    it('renders page component', async () => {
      const result = await nitroPageRoute({
        params: Promise.resolve({ slug: ['about'] })
      });

      expect(result).toBeDefined();
    });

    it('throws not found for invalid page', async () => {
      await expect(
        nitroPageRoute({
          params: Promise.resolve({ slug: ['invalid'] })
        })
      ).rejects.toThrow('Not Found');
    });
  });
});

describe('Entity Route Helpers', () => {
  beforeEach(() => {
    initNitro({ 
      accessToken: 'test-token'
    });
  });

  describe('nitroEntityRoute', () => {
    it('renders entity with custom resolver by slug', async () => {
      const resolver = async (params: Promise<{ slug: string }>) => {
        const { slug } = await params;
        return getNitroEntities().entityBySlug({ slug, typeId: 123 });
      };

      const result = await nitroEntityRoute(
        { params: Promise.resolve({ slug: 'test-entity' }) },
        { 
          resolver,
          render: (entity: Entity) => <div>{entity.entity?.entity_title}</div>
        }
      );

      expect(result).toBeDefined();
    });

    it('renders entity with custom resolver by uniqueid', async () => {
      const resolver = async (params: Promise<{ uniqueid: string }>) => {
        const { uniqueid } = await params;
        return getNitroEntities().entityByUniqueid({ uniqueid });
      };

      const result = await nitroEntityRoute(
        { params: Promise.resolve({ uniqueid: 'unique-123' }) },
        { 
          resolver,
          render: (entity: Entity) => <div>{entity.entity?.entity_title}</div>
        }
      );

      expect(result).toBeDefined();
    });

    it('uses default render when no render function provided', async () => {
      const resolver = async (params: Promise<{ slug: string }>) => {
        const { slug } = await params;
        return getNitroEntities().entityBySlug({ slug, typeId: 123 });
      };

      const result = await nitroEntityRoute(
        { params: Promise.resolve({ slug: 'test-entity' }) },
        { resolver }
      );

      expect(result).toBeDefined();
    });

    it('throws not found for invalid entity', async () => {
      const resolver = async (params: Promise<{ slug: string }>) => {
        const { slug } = await params;
        return getNitroEntities().entityBySlug({ slug, typeId: 123 });
      };

      await expect(
        nitroEntityRoute(
          { params: Promise.resolve({ slug: 'invalid-entity' }) },
          { resolver }
        )
      ).rejects.toThrow('Entity not found');
    });
  });

  describe('nitroEntityGenerateMetadata', () => {
    it('generates metadata from entity by slug', async () => {
      const resolver = async (params: Promise<{ slug: string }>) => {
        const { slug } = await params;
        return getNitroEntities().entityBySlug({ slug, typeId: 123 });
      };

      const metadata = await nitroEntityGenerateMetadata(
        { params: Promise.resolve({ slug: 'test-entity' }) },
        { resolver }
      );

      expect(metadata.title).toBe('Test Entity');
      expect(metadata.description).toBe('Test entity description');
    });

    it('generates metadata from entity by uniqueid', async () => {
      const resolver = async (params: Promise<{ uniqueid: string }>) => {
        const { uniqueid } = await params;
        return getNitroEntities().entityByUniqueid({ uniqueid });
      };

      const metadata = await nitroEntityGenerateMetadata(
        { params: Promise.resolve({ uniqueid: 'unique-123' }) },
        { resolver }
      );

      expect(metadata.title).toBe('Unique Entity');
      expect(metadata.description).toBe('Unique entity description');
    });

    it('uses default title and description for missing entity data', async () => {
      const resolver = async () => {
        return Promise.resolve({ entity: {} } as Entity);
      };

      const metadata = await nitroEntityGenerateMetadata(
        { params: Promise.resolve({ slug: 'test' }) },
        { resolver }
      );

      expect(metadata.title).toBe('Entity');
      expect(metadata.description).toBe('');
    });

    it('throws not found for invalid entity', async () => {
      const resolver = async (params: Promise<{ slug: string }>) => {
        const { slug } = await params;
        return getNitroEntities().entityBySlug({ slug, typeId: 123 });
      };

      await expect(
        nitroEntityGenerateMetadata(
          { params: Promise.resolve({ slug: 'invalid-entity' }) },
          { resolver }
        )
      ).rejects.toThrow('Entity not found');
    });
  });
});

describe('NitroDebugInfo', () => {
  beforeEach(() => {
    // Clear environment variables
    delete process.env.NODE_ENV;
    delete process.env.VERCEL_DEPLOYMENT_ID;
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    delete process.env.VERSION;
    
    // Reset global state to allow new configuration
    globalNitroState.configuration = null;
  });

  it('renders debug info with production token', () => {
    initNitro({ 
      accessToken: 'p-production-token',
      liveEdit: false
    });

    const mockConfig: Partial<ConfigResponse> = {
      nitro: {
        version: 123,
        updated_at: 1609459200 // 2021-01-01 00:00:00 UTC
      }
    };

    const { container } = render(<NitroDebugInfo config={mockConfig as ConfigResponse} />);
    const html = container.innerHTML;
    
    expect(html).toContain('<!-- ');
    expect(html).toContain('liveedit:false');
    expect(html).toContain('tokentype:production');
    expect(html).toContain('version:123');
  });

  it('renders debug info with develop token', () => {
    initNitro({ 
      accessToken: 'd-develop-token',
      liveEdit: true
    });

    const mockConfig: Partial<ConfigResponse> = {
      nitro: {
        version: 456,
        updated_at: 1609459200
      }
    };

    const { container } = render(<NitroDebugInfo config={mockConfig as ConfigResponse} />);
    const html = container.innerHTML;
    
    expect(html).toContain('liveedit:true');
    expect(html).toContain('tokentype:develop');
    expect(html).toContain('version:456');
  });

  it('includes environment variables when available', () => {
    process.env.NODE_ENV = 'production';
    process.env.VERCEL_DEPLOYMENT_ID = 'dpl_abc123';
    process.env.VERCEL_GIT_COMMIT_SHA = 'sha123abc';
    process.env.VERSION = 'v1.2.3';

    initNitro({ 
      accessToken: 'p-token',
      liveEdit: false
    });

    const mockConfig: Partial<ConfigResponse> = {
      nitro: {
        version: 789,
        updated_at: 1609459200
      }
    };

    const { container } = render(<NitroDebugInfo config={mockConfig as ConfigResponse} />);
    const html = container.innerHTML;
    
    expect(html).toContain('env:production');
    expect(html).toContain('did:dpl_abc123');
    expect(html).toContain('csha:sha123abc');
    expect(html).toContain('release:v1.2.3');
  });

  it('handles missing config data gracefully', () => {
    initNitro({ 
      accessToken: 'test-token',
      liveEdit: false
    });

    const mockConfig: Partial<ConfigResponse> = {};

    const { container } = render(<NitroDebugInfo config={mockConfig as ConfigResponse} />);
    const html = container.innerHTML;
    
    expect(html).toContain('<!-- ');
    expect(html).toContain('version:-');
    expect(html).toContain('versiondate:-');
  });

  it('formats date in de-CH locale', () => {
    initNitro({ 
      accessToken: 'test-token',
      liveEdit: false
    });

    const mockConfig: Partial<ConfigResponse> = {
      nitro: {
        version: 1,
        updated_at: 1609459200 // 2021-01-01 00:00:00 UTC
      }
    };

    const { container } = render(<NitroDebugInfo config={mockConfig as ConfigResponse} />);
    const html = container.innerHTML;
    
    // Check that a formatted date is present (format: DD.MM.YYYY, HH:MM)
    expect(html).toContain('versiondate:');
    expect(html).toMatch(/versiondate:\d{2}\.\d{2}\.\d{4},\s\d{2}:\d{2}/);
  });
});

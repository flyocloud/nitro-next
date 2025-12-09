import React from 'react';
import '@testing-library/jest-dom'; // Add this line
import { render, screen } from '@testing-library/react';
import {
  initNitro,
  getNitroConfig,
  NitroPage,
  NitroBlock,
  getNitroPages,
  getNitroEntities,
  nitroPageRoute,
  nitroPageGenerateMetadata,
  nitroPageGenerateStaticParams,
  nitroEntityRoute,
  nitroEntityGenerateMetadata
} from './server';
import { Configuration, Page, Block, Entity } from '@flyo/nitro-typescript';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('Not Found');
  }),
}));

// Mock @flyo/nitro-typescript
jest.mock('@flyo/nitro-typescript', () => {
  return {
    Configuration: jest.fn(),
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

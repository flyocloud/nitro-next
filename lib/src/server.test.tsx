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
  nitroGenerateMetadata,
  nitroGenerateStaticParams
} from './server';
import { EntitiesApi, Configuration, Page, Block } from '@flyo/nitro-typescript';

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
    EntitiesApi: jest.fn(),
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
        expect(api).toBeInstanceOf(EntitiesApi);
    });
});

describe('Route Helpers', () => {
  beforeEach(() => {
    initNitro({ 
      accessToken: 'test-token'
    });
  });

  describe('nitroGenerateStaticParams', () => {
    it('generates static params from config pages', async () => {
      const params = await nitroGenerateStaticParams();
      
      expect(params).toEqual([
        { slug: undefined }, // homepage
        { slug: ['about'] },
        { slug: ['blog', 'post-1'] }
      ]);
    });
  });

  describe('nitroGenerateMetadata', () => {
    it('generates metadata from page data', async () => {
      const metadata = await nitroGenerateMetadata({
        params: Promise.resolve({ slug: ['about'] })
      });

      expect(metadata.title).toBe('About Us');
      expect(metadata.description).toBe('Learn about us');
    });

    it('throws not found for invalid page', async () => {
      await expect(
        nitroGenerateMetadata({
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

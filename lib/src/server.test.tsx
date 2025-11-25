import React from 'react';
import '@testing-library/jest-dom'; // Add this line
import { render, screen } from '@testing-library/react';
import {
  initNitro,
  getNitroConfig,
  NitroPage,
  NitroBlock,
  getNitroPages,
  getNitroEntities
} from './server';
import { PagesApi, EntitiesApi, Configuration, Page, Block } from '@flyo/nitro-typescript';

// Mock @flyo/nitro-typescript
jest.mock('@flyo/nitro-typescript', () => {
  return {
    Configuration: jest.fn(),
    ConfigApi: jest.fn().mockImplementation(() => ({
      config: jest.fn().mockResolvedValue({ title: 'Mock Config' }),
    })),
    PagesApi: jest.fn(),
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
    expect(config).toEqual({ title: 'Mock Config' });
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
        expect(api).toBeInstanceOf(PagesApi);
    });

    it('getNitroEntities returns EntitiesApi instance', () => {
        const api = getNitroEntities();
        expect(api).toBeInstanceOf(EntitiesApi);
    });
});

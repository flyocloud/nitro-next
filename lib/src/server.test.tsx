import React from 'react';
import '@testing-library/jest-dom'; // Add this line
import { render, screen } from '@testing-library/react';
import {
  FlyoNitroConfiguration,
  getConfig,
  FlyoNitroPage,
  FlyoNitroBlock,
  getPagesApi,
  getEntitiesApi
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

describe('FlyoNitroConfiguration', () => {
  it('initializes configuration with access token', () => {
    const accessToken = 'test-token';
    FlyoNitroConfiguration({ accessToken });
    expect(Configuration).toHaveBeenCalledWith({ apiKey: accessToken });
  });
});

describe('getConfig', () => {

  it('returns config', async () => {
    const config = await getConfig();
    expect(config).toEqual({ title: 'Mock Config' });
  });
});

describe('FlyoNitroPage', () => {
  it('renders nothing if page json is missing', () => {
    const { container } = render(<FlyoNitroPage page={{} as Page} />);
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
    FlyoNitroConfiguration({ 
        accessToken: 'test', 
        components: { TestBlock } 
    });

    render(<FlyoNitroPage page={page} />);
    expect(screen.getByText('Block 1')).toBeInTheDocument();
    expect(screen.getByText('Block 2')).toBeInTheDocument();
  });
});

describe('FlyoNitroBlock', () => {
  it('renders fallback if component not found', () => {
    const block = { uid: '1', component: 'Unknown', content: 'Hidden' } as unknown as Block;
    render(<FlyoNitroBlock block={block} />);
    // The fallback renders JSON
    expect(screen.getByText((content) => content.includes('Unknown'))).toBeInTheDocument();
  });

  it('renders component if found', () => {
    const block = { uid: '1', component: 'Known', content: 'Visible' } as unknown as Block;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Known = ({ block }: { block: Block }) => <div>{(block as any).content}</div>;
    
    FlyoNitroConfiguration({ 
        accessToken: 'test', 
        components: { Known } 
    });

    render(<FlyoNitroBlock block={block} />);
    expect(screen.getByText('Visible')).toBeInTheDocument();
  });
});

describe('Hooks', () => {
    it('getPagesApi returns PagesApi instance', () => {
        const api = getPagesApi();
        expect(api).toBeInstanceOf(PagesApi);
    });

    it('getEntitiesApi returns EntitiesApi instance', () => {
        const api = getEntitiesApi();
        expect(api).toBeInstanceOf(EntitiesApi);
    });
});

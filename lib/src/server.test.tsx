import React from 'react';
import '@testing-library/jest-dom'; // Add this line
import { render, screen, waitFor } from '@testing-library/react';
import {
  FlyoNitroConfiguration,
  useConfigApi,
  FlyoNitroPage,
  FlyoNitroBlock,
  usePagesApi,
  useEntitiesApi
} from './server';
import { ConfigApi, PagesApi, EntitiesApi, Configuration } from '@flyo/nitro-typescript';

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

describe('useConfigApi', () => {
  it('fetches configuration', async () => {
    const config = await useConfigApi();
    expect(config).toEqual({ title: 'Mock Config' });
  });
});

describe('FlyoNitroPage', () => {
  it('renders nothing if page json is missing', () => {
    const { container } = render(<FlyoNitroPage page={{} as any} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders blocks', () => {
    const page = {
      json: [
        { uid: '1', component: 'TestBlock', content: 'Block 1' },
        { uid: '2', component: 'TestBlock', content: 'Block 2' },
      ],
    } as any;

    // Register a component for TestBlock
    const TestBlock = ({ block }: any) => <div>{block.content}</div>;
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
    const block = { uid: '1', component: 'Unknown', content: 'Hidden' } as any;
    render(<FlyoNitroBlock block={block} />);
    // The fallback renders JSON
    expect(screen.getByText((content) => content.includes('Unknown'))).toBeInTheDocument();
  });

  it('renders component if found', () => {
    const block = { uid: '1', component: 'Known', content: 'Visible' } as any;
    const Known = ({ block }: any) => <div>{block.content}</div>;
    
    FlyoNitroConfiguration({ 
        accessToken: 'test', 
        components: { Known } 
    });

    render(<FlyoNitroBlock block={block} />);
    expect(screen.getByText('Visible')).toBeInTheDocument();
  });
});

describe('Hooks', () => {
    it('usePagesApi returns PagesApi instance', () => {
        const api = usePagesApi();
        expect(api).toBeInstanceOf(PagesApi);
    });

    it('useEntitiesApi returns EntitiesApi instance', () => {
        const api = useEntitiesApi();
        expect(api).toBeInstanceOf(EntitiesApi);
    });
});

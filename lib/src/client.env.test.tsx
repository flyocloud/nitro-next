import React from 'react';
import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import type { Entity } from '@flyo/nitro-typescript';

// The bridge is only imported for its side-effect-free helpers here.
jest.mock('@flyo/nitro-js-bridge', () => ({
  highlightAndClick: jest.fn(),
  wysiwyg: jest.fn(() => ''),
  reload: jest.fn(),
  scrollTo: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

const ENV_KEYS = [
  'FLYO_LIVE_EDIT',
  'NEXT_PUBLIC_FLYO_LIVE_EDIT',
  'NEXT_PUBLIC_VERCEL_ENV',
  'NEXT_PUBLIC_CONTEXT',
  'NEXT_PUBLIC_ENV',
  'NODE_ENV',
] as const;

/**
 * `isProd` is a module-level constant resolved at import time — exactly how it
 * behaves once a bundler has inlined the variables. So each case sets the
 * environment first and then re-imports the module.
 */
function loadClient(env: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
  Object.assign(process.env, env);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mod: any;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('./client');
  });
  return mod as typeof import('./client');
}

describe('isProd', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('trusts the Vercel marker over NODE_ENV — a preview build is not production', () => {
    // The actual bug: Vercel builds previews with NODE_ENV=production.
    expect(
      loadClient({ NODE_ENV: 'production', NEXT_PUBLIC_VERCEL_ENV: 'preview' }).isProd,
    ).toBe(false);
  });

  it('is true on a Vercel production deployment', () => {
    expect(
      loadClient({ NODE_ENV: 'production', NEXT_PUBLIC_VERCEL_ENV: 'production' }).isProd,
    ).toBe(true);
  });

  it('is false on a Vercel development build', () => {
    expect(
      loadClient({ NODE_ENV: 'development', NEXT_PUBLIC_VERCEL_ENV: 'development' }).isProd,
    ).toBe(false);
  });

  it('reads the Netlify contexts', () => {
    expect(loadClient({ NODE_ENV: 'production', NEXT_PUBLIC_CONTEXT: 'production' }).isProd).toBe(
      true,
    );
    expect(
      loadClient({ NODE_ENV: 'production', NEXT_PUBLIC_CONTEXT: 'deploy-preview' }).isProd,
    ).toBe(false);
    expect(
      loadClient({ NODE_ENV: 'production', NEXT_PUBLIC_CONTEXT: 'branch-deploy' }).isProd,
    ).toBe(false);
    expect(loadClient({ NODE_ENV: 'production', NEXT_PUBLIC_CONTEXT: 'dev' }).isProd).toBe(false);
  });

  it('supports the generic NEXT_PUBLIC_ENV convention, including staging', () => {
    expect(loadClient({ NODE_ENV: 'production', NEXT_PUBLIC_ENV: 'staging' }).isProd).toBe(false);
    expect(loadClient({ NODE_ENV: 'production', NEXT_PUBLIC_ENV: 'prod' }).isProd).toBe(true);
  });

  it('is false when live editing is on, whatever the platform says', () => {
    expect(
      loadClient({
        NODE_ENV: 'production',
        NEXT_PUBLIC_VERCEL_ENV: 'production',
        FLYO_LIVE_EDIT: 'true',
      }).isProd,
    ).toBe(false);

    // The public flag is the one that survives into the browser bundle.
    expect(
      loadClient({
        NODE_ENV: 'production',
        NEXT_PUBLIC_VERCEL_ENV: 'production',
        NEXT_PUBLIC_FLYO_LIVE_EDIT: 'true',
      }).isProd,
    ).toBe(false);
  });

  it('ignores a live-edit flag that is off or not exactly "true"', () => {
    expect(
      loadClient({
        NODE_ENV: 'production',
        NEXT_PUBLIC_VERCEL_ENV: 'production',
        FLYO_LIVE_EDIT: 'false',
      }).isProd,
    ).toBe(true);

    expect(
      loadClient({
        NODE_ENV: 'production',
        NEXT_PUBLIC_VERCEL_ENV: 'production',
        NEXT_PUBLIC_FLYO_LIVE_EDIT: '1',
      }).isProd,
    ).toBe(true);
  });

  it('stays true when a marker is empty or unknown — only a clear non-production value turns it off', () => {
    expect(
      loadClient({
        NODE_ENV: 'production',
        NEXT_PUBLIC_VERCEL_ENV: '',
        NEXT_PUBLIC_ENV: 'production',
      }).isProd,
    ).toBe(true);

    expect(
      loadClient({ NODE_ENV: 'production', NEXT_PUBLIC_VERCEL_ENV: 'something-else' }).isProd,
    ).toBe(true);
  });

  it('falls back to NODE_ENV when no platform marker is present', () => {
    expect(loadClient({ NODE_ENV: 'production' }).isProd).toBe(true);
    expect(loadClient({ NODE_ENV: 'development' }).isProd).toBe(false);
    expect(loadClient({}).isProd).toBe(false);
  });
});

describe('FlyoMetric', () => {
  const originalEnv = { ...process.env };
  const metricEntity = {
    entity: { entity_metric: { api: 'https://api.flyo.cloud/metric/1' } },
  } as unknown as Entity;

  beforeEach(() => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: true })) as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it('tracks on the production deployment', () => {
    const { FlyoMetric } = loadClient({
      NODE_ENV: 'production',
      NEXT_PUBLIC_VERCEL_ENV: 'production',
    });

    render(<FlyoMetric entity={metricEntity} />);

    expect(global.fetch).toHaveBeenCalledWith('https://api.flyo.cloud/metric/1');
  });

  it('does not track from a preview deployment', () => {
    const { FlyoMetric } = loadClient({
      NODE_ENV: 'production',
      NEXT_PUBLIC_VERCEL_ENV: 'preview',
    });

    render(<FlyoMetric entity={metricEntity} />);

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not track an editor session — live edit on a production deployment', () => {
    const { FlyoMetric } = loadClient({
      NODE_ENV: 'production',
      NEXT_PUBLIC_VERCEL_ENV: 'production',
      NEXT_PUBLIC_FLYO_LIVE_EDIT: 'true',
    });

    render(<FlyoMetric entity={metricEntity} />);

    expect(global.fetch).not.toHaveBeenCalled();
  });
});

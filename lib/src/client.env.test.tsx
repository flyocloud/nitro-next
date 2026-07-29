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
  'NEXT_PUBLIC_FLYO_ENV',
  'NEXT_PUBLIC_VERCEL_ENV',
  'NEXT_PUBLIC_CONTEXT',
  'NEXT_PUBLIC_ENV',
  'NODE_ENV',
] as const;

/**
 * `flyoEnv` / `isProd` are module-level constants resolved at import time —
 * exactly how they behave once a bundler has inlined the variables. So each
 * case sets the environment first and then re-imports the module.
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

describe('flyoEnv / isProd / isPreview', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('trusts the Vercel marker over NODE_ENV — a preview build is not production', () => {
    // The actual bug: Vercel builds previews with NODE_ENV=production.
    const { flyoEnv, isProd, isPreview } = loadClient({
      NODE_ENV: 'production',
      NEXT_PUBLIC_VERCEL_ENV: 'preview',
    });

    expect(flyoEnv).toBe('preview');
    expect(isProd).toBe(false);
    expect(isPreview).toBe(true);
  });

  it('resolves production on a Vercel production deployment', () => {
    const { flyoEnv, isProd, isPreview } = loadClient({
      NODE_ENV: 'production',
      NEXT_PUBLIC_VERCEL_ENV: 'production',
    });

    expect(flyoEnv).toBe('production');
    expect(isProd).toBe(true);
    expect(isPreview).toBe(false);
  });

  it('resolves development on a Vercel development build', () => {
    const { flyoEnv, isProd } = loadClient({
      NODE_ENV: 'development',
      NEXT_PUBLIC_VERCEL_ENV: 'development',
    });

    expect(flyoEnv).toBe('development');
    expect(isProd).toBe(false);
  });

  it('maps the Netlify contexts', () => {
    expect(loadClient({ NODE_ENV: 'production', NEXT_PUBLIC_CONTEXT: 'production' }).flyoEnv).toBe(
      'production',
    );
    expect(
      loadClient({ NODE_ENV: 'production', NEXT_PUBLIC_CONTEXT: 'deploy-preview' }).flyoEnv,
    ).toBe('preview');
    expect(
      loadClient({ NODE_ENV: 'production', NEXT_PUBLIC_CONTEXT: 'branch-deploy' }).flyoEnv,
    ).toBe('preview');
    expect(loadClient({ NODE_ENV: 'production', NEXT_PUBLIC_CONTEXT: 'dev' }).flyoEnv).toBe(
      'development',
    );
  });

  it('supports the generic NEXT_PUBLIC_ENV convention, including staging', () => {
    expect(loadClient({ NODE_ENV: 'production', NEXT_PUBLIC_ENV: 'staging' }).flyoEnv).toBe(
      'preview',
    );
    expect(loadClient({ NODE_ENV: 'production', NEXT_PUBLIC_ENV: 'prod' }).flyoEnv).toBe(
      'production',
    );
  });

  it('lets NEXT_PUBLIC_FLYO_ENV override the platform marker', () => {
    // Opting a preview deployment into production behaviour…
    expect(
      loadClient({
        NODE_ENV: 'production',
        NEXT_PUBLIC_VERCEL_ENV: 'preview',
        NEXT_PUBLIC_FLYO_ENV: 'production',
      }).isProd,
    ).toBe(true);

    // …and out of it.
    expect(
      loadClient({
        NODE_ENV: 'production',
        NEXT_PUBLIC_VERCEL_ENV: 'production',
        NEXT_PUBLIC_FLYO_ENV: 'preview',
      }).isProd,
    ).toBe(false);
  });

  it('ignores empty and unknown values so the next marker wins', () => {
    expect(
      loadClient({
        NODE_ENV: 'production',
        NEXT_PUBLIC_FLYO_ENV: '',
        NEXT_PUBLIC_VERCEL_ENV: 'production',
      }).isProd,
    ).toBe(true);

    expect(
      loadClient({
        NODE_ENV: 'production',
        NEXT_PUBLIC_VERCEL_ENV: 'something-else',
      }).isProd,
    ).toBe(true);
  });

  it('falls back to NODE_ENV when no platform marker is present', () => {
    expect(loadClient({ NODE_ENV: 'production' }).flyoEnv).toBe('production');
    expect(loadClient({ NODE_ENV: 'development' }).flyoEnv).toBe('development');
    expect(loadClient({ NODE_ENV: 'test' }).flyoEnv).toBe('development');
    expect(loadClient({}).flyoEnv).toBe('development');
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
});

import React from 'react';
import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import type { Entity } from '@flyo/nitro-typescript';
import { FlyoMetric, isProd } from './client';

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

const metricEntity = {
  entity: { entity_metric: { api: 'https://api.flyo.cloud/metric/1' } },
} as unknown as Entity;

describe('FlyoMetric', () => {
  beforeEach(() => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: true })) as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('tracks by default', () => {
    render(<FlyoMetric entity={metricEntity} />);

    expect(global.fetch).toHaveBeenCalledWith('https://api.flyo.cloud/metric/1');
  });

  it('tracks when explicitly enabled', () => {
    render(<FlyoMetric entity={metricEntity} enabled />);

    expect(global.fetch).toHaveBeenCalledWith('https://api.flyo.cloud/metric/1');
  });

  it('does not track when disabled — e.g. enabled={!flyo.state.liveEdit}', () => {
    render(<FlyoMetric entity={metricEntity} enabled={false} />);

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('re-sends when the deployment flips from disabled to enabled', () => {
    const { rerender } = render(<FlyoMetric entity={metricEntity} enabled={false} />);
    expect(global.fetch).not.toHaveBeenCalled();

    rerender(<FlyoMetric entity={metricEntity} enabled />);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a metric API url, enabled or not', () => {
    const bare = { entity: { entity_title: 'No metric' } } as unknown as Entity;

    render(<FlyoMetric entity={bare} />);

    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('isProd (deprecated)', () => {
  it('is still exported so existing imports keep compiling', () => {
    // Jest runs with NODE_ENV=test, i.e. the plain NODE_ENV check it fell back
    // to before — no platform markers are consulted any more.
    expect(isProd).toBe(false);
  });
});

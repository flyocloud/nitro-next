import { FlyoCdnLoader, FlyoCdnLoaderCrop } from './client';

// The bridge is only imported for its side-effect-free helpers in client.tsx,
// but jest still resolves the module graph — keep it cheap.
jest.mock('@flyo/nitro-js-bridge', () => ({
  highlightAndClick: jest.fn(),
  wysiwyg: jest.fn(),
  reload: jest.fn(),
  scrollTo: jest.fn(),
}));

describe('FlyoCdnLoader', () => {
  it('prefixes a relative src with the Flyo CDN host', () => {
    expect(FlyoCdnLoader({ src: 'me.png', width: 500, quality: 75 })).toBe(
      'https://storage.flyo.cloud/me.png?w=500&format=webp'
    );
  });

  it('strips a leading slash to avoid a double slash', () => {
    expect(FlyoCdnLoader({ src: '/me.png', width: 500, quality: 75 })).toBe(
      'https://storage.flyo.cloud/me.png?w=500&format=webp'
    );
  });

  it('leaves an absolute Flyo CDN url untouched', () => {
    expect(
      FlyoCdnLoader({
        src: 'https://storage.flyo.cloud/lowe_a8173f2a.jpg',
        width: 800,
        quality: 75,
      })
    ).toBe('https://storage.flyo.cloud/lowe_a8173f2a.jpg?w=800&format=webp');
  });

  it('omits "h" so the height stays dynamic — no legacy /thumb segment', () => {
    const url = FlyoCdnLoader({ src: 'me.png', width: 500, quality: 75 });

    expect(url).not.toContain('/thumb/');
    expect(url).not.toContain('null');
    expect(url).not.toContain('h=');
  });

  it('appends to a src that already carries a query string', () => {
    expect(
      FlyoCdnLoader({ src: 'me.png?v=2', width: 500, quality: 75 })
    ).toBe('https://storage.flyo.cloud/me.png?v=2&w=500&format=webp');
  });
});

describe('FlyoCdnLoaderCrop', () => {
  it('derives the height from the aspect ratio so the CDN really crops', () => {
    const loader = FlyoCdnLoaderCrop({ aspectRatio: 1 });

    expect(loader({ src: 'me.png', width: 700, quality: 75 })).toBe(
      'https://storage.flyo.cloud/me.png?w=700&h=700&format=webp'
    );
  });

  it('rounds non-integer heights', () => {
    const loader = FlyoCdnLoaderCrop({ aspectRatio: 16 / 9 });

    expect(loader({ src: 'me.png', width: 640, quality: 75 })).toBe(
      'https://storage.flyo.cloud/me.png?w=640&h=360&format=webp'
    );
    // 500 / (16/9) = 281.25 → 281
    expect(loader({ src: 'me.png', width: 500, quality: 75 })).toBe(
      'https://storage.flyo.cloud/me.png?w=500&h=281&format=webp'
    );
  });

  it('never produces a zero height for extreme ratios', () => {
    const loader = FlyoCdnLoaderCrop({ aspectRatio: 1000 });

    expect(loader({ src: 'me.png', width: 100, quality: 75 })).toBe(
      'https://storage.flyo.cloud/me.png?w=100&h=1&format=webp'
    );
  });

  it('falls back to a ratio-preserving resize when no aspect ratio is given', () => {
    const loader = FlyoCdnLoaderCrop();

    expect(loader({ src: 'me.png', width: 400, quality: 75 })).toBe(
      'https://storage.flyo.cloud/me.png?w=400&format=webp'
    );
  });

  it('honours a custom format', () => {
    const loader = FlyoCdnLoaderCrop({ aspectRatio: 4 / 3, format: 'jpg' });

    expect(loader({ src: 'me.png', width: 800, quality: 75 })).toBe(
      'https://storage.flyo.cloud/me.png?w=800&h=600&format=jpg'
    );
  });

  it('does not clamp when no maxWidth is given — the CDN applies its own limits', () => {
    const loader = FlyoCdnLoaderCrop({ aspectRatio: 1 });

    expect(loader({ src: 'me.png', width: 3840, quality: 75 })).toBe(
      'https://storage.flyo.cloud/me.png?w=3840&h=3840&format=webp'
    );
  });

  it('clamps to an explicit maxWidth (e.g. the real source width)', () => {
    const loader = FlyoCdnLoaderCrop({ aspectRatio: 1, maxWidth: 679 });

    expect(loader({ src: 'me.png', width: 1400, quality: 75 })).toBe(
      'https://storage.flyo.cloud/me.png?w=679&h=679&format=webp'
    );
    // Below the cap the requested width is used as-is.
    expect(loader({ src: 'me.png', width: 384, quality: 75 })).toBe(
      'https://storage.flyo.cloud/me.png?w=384&h=384&format=webp'
    );
  });

  it('prefixes relative sources like FlyoCdnLoader does', () => {
    const loader = FlyoCdnLoaderCrop({ aspectRatio: 1 });

    expect(loader({ src: '/me.png', width: 250, quality: 75 })).toBe(
      'https://storage.flyo.cloud/me.png?w=250&h=250&format=webp'
    );
    expect(
      loader({ src: 'https://storage.flyo.cloud/me.png', width: 250, quality: 75 })
    ).toBe('https://storage.flyo.cloud/me.png?w=250&h=250&format=webp');
  });

  it('emits a positive integer width even for a fractional maxWidth', () => {
    // 0 / an empty value / "null" are rejected by the CDN with an HTTP 400.
    const loader = FlyoCdnLoaderCrop({ aspectRatio: 1, maxWidth: 1.4 });

    expect(loader({ src: 'me.png', width: 640, quality: 75 })).toBe(
      'https://storage.flyo.cloud/me.png?w=1&h=1&format=webp'
    );
  });

  it('appends to a src that already carries a query string', () => {
    const loader = FlyoCdnLoaderCrop({ aspectRatio: 1 });

    expect(loader({ src: 'me.png?v=2', width: 300, quality: 75 })).toBe(
      'https://storage.flyo.cloud/me.png?v=2&w=300&h=300&format=webp'
    );
  });

  it('rejects an invalid aspect ratio at creation time', () => {
    expect(() => FlyoCdnLoaderCrop({ aspectRatio: 0 })).toThrow(/positive, finite number/);
    expect(() => FlyoCdnLoaderCrop({ aspectRatio: -1 })).toThrow(/positive, finite number/);
    expect(() => FlyoCdnLoaderCrop({ aspectRatio: Number.NaN })).toThrow(/positive, finite number/);
  });

  it('rejects an invalid maxWidth at creation time', () => {
    expect(() => FlyoCdnLoaderCrop({ maxWidth: 0 })).toThrow(/at least 1/);
    expect(() => FlyoCdnLoaderCrop({ maxWidth: Number.NaN })).toThrow(/at least 1/);
  });
});

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
      'https://storage.flyo.cloud/me.png/thumb/500xnull?format=webp'
    );
  });

  it('strips a leading slash to avoid a double slash', () => {
    expect(FlyoCdnLoader({ src: '/me.png', width: 500, quality: 75 })).toBe(
      'https://storage.flyo.cloud/me.png/thumb/500xnull?format=webp'
    );
  });

  it('leaves an absolute Flyo CDN url untouched', () => {
    expect(
      FlyoCdnLoader({
        src: 'https://storage.flyo.cloud/lowe_a8173f2a.jpg',
        width: 800,
        quality: 75,
      })
    ).toBe('https://storage.flyo.cloud/lowe_a8173f2a.jpg/thumb/800xnull?format=webp');
  });
});

describe('FlyoCdnLoaderCrop', () => {
  it('derives the height from the aspect ratio so the CDN really crops', () => {
    const loader = FlyoCdnLoaderCrop({ aspectRatio: 1 });

    expect(loader({ src: 'me.png', width: 700, quality: 75 })).toBe(
      'https://storage.flyo.cloud/me.png/thumb/700x700?format=webp'
    );
  });

  it('rounds non-integer heights', () => {
    const loader = FlyoCdnLoaderCrop({ aspectRatio: 16 / 9 });

    expect(loader({ src: 'me.png', width: 640, quality: 75 })).toBe(
      'https://storage.flyo.cloud/me.png/thumb/640x360?format=webp'
    );
    // 500 / (16/9) = 281.25 → 281
    expect(loader({ src: 'me.png', width: 500, quality: 75 })).toBe(
      'https://storage.flyo.cloud/me.png/thumb/500x281?format=webp'
    );
  });

  it('never produces a zero height for extreme ratios', () => {
    const loader = FlyoCdnLoaderCrop({ aspectRatio: 1000 });

    expect(loader({ src: 'me.png', width: 100, quality: 75 })).toBe(
      'https://storage.flyo.cloud/me.png/thumb/100x1?format=webp'
    );
  });

  it('falls back to a ratio-preserving resize when no aspect ratio is given', () => {
    const loader = FlyoCdnLoaderCrop();

    expect(loader({ src: 'me.png', width: 400, quality: 75 })).toBe(
      'https://storage.flyo.cloud/me.png/thumb/400xnull?format=webp'
    );
  });

  it('honours a custom format', () => {
    const loader = FlyoCdnLoaderCrop({ aspectRatio: 4 / 3, format: 'jpg' });

    expect(loader({ src: 'me.png', width: 800, quality: 75 })).toBe(
      'https://storage.flyo.cloud/me.png/thumb/800x600?format=jpg'
    );
  });

  it('clamps to the 2560px upload cap so the crop is not silently dropped', () => {
    const loader = FlyoCdnLoaderCrop({ aspectRatio: 1 });

    expect(loader({ src: 'me.png', width: 3840, quality: 75 })).toBe(
      'https://storage.flyo.cloud/me.png/thumb/2560x2560?format=webp'
    );
  });

  it('clamps to an explicit maxWidth (e.g. the real source width)', () => {
    const loader = FlyoCdnLoaderCrop({ aspectRatio: 1, maxWidth: 679 });

    expect(loader({ src: 'me.png', width: 1400, quality: 75 })).toBe(
      'https://storage.flyo.cloud/me.png/thumb/679x679?format=webp'
    );
    // Below the cap the requested width is used as-is.
    expect(loader({ src: 'me.png', width: 384, quality: 75 })).toBe(
      'https://storage.flyo.cloud/me.png/thumb/384x384?format=webp'
    );
  });

  it('prefixes relative sources like FlyoCdnLoader does', () => {
    const loader = FlyoCdnLoaderCrop({ aspectRatio: 1 });

    expect(loader({ src: '/me.png', width: 250, quality: 75 })).toBe(
      'https://storage.flyo.cloud/me.png/thumb/250x250?format=webp'
    );
    expect(
      loader({ src: 'https://storage.flyo.cloud/me.png', width: 250, quality: 75 })
    ).toBe('https://storage.flyo.cloud/me.png/thumb/250x250?format=webp');
  });

  it('rejects an invalid aspect ratio at creation time', () => {
    expect(() => FlyoCdnLoaderCrop({ aspectRatio: 0 })).toThrow(/positive, finite number/);
    expect(() => FlyoCdnLoaderCrop({ aspectRatio: -1 })).toThrow(/positive, finite number/);
    expect(() => FlyoCdnLoaderCrop({ aspectRatio: Number.NaN })).toThrow(/positive, finite number/);
  });
});

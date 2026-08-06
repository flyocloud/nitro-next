import Image from 'next/image';
import { FlyoCdnLoader, FlyoCdnLoaderCrop } from '@flyo/nitro-next/client';

export default async function ImageExamplePage() {
  return (
    <div style={{ padding: '2rem' }}>
      <h1>Flyo CDN Image Loader Example</h1>

      <div style={{ marginTop: '2rem' }}>
        <h2>Example with relative path (will be prefixed with storage.flyo.cloud)</h2>
        <Image
          loader={FlyoCdnLoader}
          src="me.png"
          alt="Picture of the author"
          width={500}
          height={500}
        />
      </div>

      <div style={{ marginTop: '2rem' }}>
        <h2>Example with full Flyo URL (will not be prefixed)</h2>
        <Image
          loader={FlyoCdnLoader}
          src="https://storage.flyo.cloud/lowe_a8173f2a.jpg"
          alt="Example image"
          width={800}
          height={600}
        />
      </div>

      <h2 style={{ marginTop: '3rem' }}>Cropped variants (focal point aware)</h2>
      <p>
        <code>FlyoCdnLoader</code> requests <code>{'{width}xnull'}</code>, a ratio-preserving
        resize — the CDN never crops, so the asset&apos;s focal point is not applied and the
        browser centre-crops instead. <code>FlyoCdnLoaderCrop</code> requests a fixed
        <code> {'{width}x{height}'}</code>, which makes the CDN crop for real and honour the focal
        point.
      </p>

      <div style={{ marginTop: '2rem' }}>
        <h3>Square crop — requests /thumb/700x700</h3>
        <Image
          loader={FlyoCdnLoaderCrop({ aspectRatio: 1 })}
          src="https://storage.flyo.cloud/lowe_a8173f2a.jpg"
          alt="Square crop"
          width={700}
          height={700}
          style={{ objectFit: 'cover' }}
        />
      </div>

      <div style={{ marginTop: '2rem' }}>
        <h3>
          16:9 crop with maxWidth — the source is 1200px wide, so srcset candidates are
          capped at /thumb/1200x675 instead of asking for a width the CDN would answer with
          the uncropped original
        </h3>
        <Image
          loader={FlyoCdnLoaderCrop({ aspectRatio: 16 / 9, maxWidth: 1200 })}
          src="https://storage.flyo.cloud/lowe_a8173f2a.jpg"
          alt="Widescreen crop"
          width={1600}
          height={900}
          style={{ objectFit: 'cover', maxWidth: '100%', height: 'auto' }}
        />
      </div>
    </div>
  );
}

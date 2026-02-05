import Image from 'next/image';
import { FlyoCdnLoader } from '@flyo/nitro-next/client';

export default function ImageExamplePage() {
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
    </div>
  );
}

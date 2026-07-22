import Image from 'next/image';
import { FlyoCdnLoader } from '@flyo/nitro-next/client';
import { getLanguageLinks, publishLanguageLinks } from '@flyo/nitro-next/server';
import { flyo } from '@/flyo.config';

export default async function ImageExamplePage() {
  // Custom route (no Flyo page/entity resolver) that still renders the shared
  // footer switcher — publish a fallback so `readLanguageLinks()` resolves.
  const currentLang = await flyo.getRequestLocale();
  publishLanguageLinks(getLanguageLinks(undefined, { currentLang, locales: flyo.state.locales }));

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

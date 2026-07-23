'use client';

import type { WysiwygNode } from '@flyo/nitro-next/client';

// The attrs an image node carries in Flyo's ProseMirror JSON.
type ImageAttrs = {
  src: { source: string; caption?: string; copyright?: string };
  alt?: string;
  title?: string;
};

export default function CustomImage({ node }: { node: WysiwygNode }) {
  const { src, alt, title } = node.attrs as ImageAttrs;

  return (
    <img
      src={src.source}
      alt={alt}
      title={title}
      style={{ maxWidth: '100%', height: 'auto', border: '1px solid #c07171ff', borderRadius: '16px', margin: '1rem 0' }}
    />
  );
}

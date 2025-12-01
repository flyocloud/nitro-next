'use client';

interface ImageNode {
  node: {
    attrs: {
      src: { source: string, caption?: string, copyright?: string };
      alt?: string;
      title?: string;
    };
  };
}

export default function CustomImage({ node }: ImageNode) {
  const { src, alt, title } = node.attrs;


  
  return (
    <img 
      src={src.source} 
      alt={alt} 
      title={title} 
      style={{ maxWidth: '100%', height: 'auto', border: '1px solid #c07171ff', borderRadius: '16px', margin: '1rem 0' }} 
    />
  );
}

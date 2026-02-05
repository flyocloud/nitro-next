'use client';

import { useEffect } from 'react';
import { highlightAndClick, wysiwyg, reload} from '@flyo/nitro-js-bridge';
import { Block, Entity } from "@flyo/nitro-typescript";
import type { ImageLoaderProps } from 'next/image';

const FLYO_CDN_HOST = 'storage.flyo.cloud';

/**
 * Check if running in production environment
 */
export const isProd = process.env.NODE_ENV === 'production';

/**
 * Type for WYSIWYG node structure
 */
interface WysiwygNode {
  type: string;
  content?: WysiwygNode[];
  [key: string]: unknown;
}

/**
 * Type for WYSIWYG JSON that can be a node, array of nodes, or doc structure
 */
type WysiwygJson = WysiwygNode | WysiwygNode[] | { type: 'doc'; content: WysiwygNode[] };

/**
 * Helper function to get editable props
 */
export function editable(block: Block): { 'data-flyo-uid'?: string } {
  if (typeof block.uid === 'string' && block.uid.trim() !== '') {
    return { 'data-flyo-uid': block.uid };
  }
  return {};
}

/**
 * Internal client component that sets up live editing functionality
 */
export function FlyoClientWrapper({ 
  children,
}: { 
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    reload();

    const wireAll = () => {
      const elements = document.querySelectorAll('[data-flyo-uid]');
      elements.forEach((el) => {
        const uid = el.getAttribute('data-flyo-uid');
        if (uid && el instanceof HTMLElement) {
          highlightAndClick(uid, el);
        }
      });
    };

    wireAll();

    const observer = new MutationObserver((mutations) => {
      const hasRelevantChanges = mutations.some(mutation => 
        Array.from(mutation.addedNodes).some(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            return element.hasAttribute('data-flyo-uid') || 
                   element.querySelector('[data-flyo-uid]');
          }
          return false;
        })
      );

      if (hasRelevantChanges) {
        wireAll();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  return <>{children}</>;
}

/**
 * WYSIWYG component for rendering ProseMirror/TipTap JSON content
 * 
 * @example
 * ```tsx
 * import { FlyoWysiwyg } from '@flyo/nitro-next/client';
 * import CustomImage from './CustomImage';
 * 
 * export default function MyComponent({ block }) {
 *   return (
 *     <FlyoWysiwyg 
 *       json={block.content.json} 
 *       components={{
 *         image: CustomImage
 *       }} 
 *     />
 *   );
 * }
 * ```
 */
export function FlyoWysiwyg({
  json,
  components = {},
}: {
  json: WysiwygJson;
  components?: Record<string, React.ComponentType<{ node: WysiwygNode }>>;
}) {
  let nodes: WysiwygNode[] = [];

  if (json) {
    if (Array.isArray(json)) {
      nodes = json;
    } else if ('type' in json && json.type === 'doc' && Array.isArray(json.content)) {
      nodes = json.content;
    } else {
      nodes = [json as WysiwygNode];
    }
  }

  return (
    <>
      {nodes.map((node: WysiwygNode, index: number) => {
        const Component = components[node.type];
        if (Component) {
          return <Component key={index} node={node} />;
        }
        
        const html = wysiwyg(node);
        return <div key={index} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </>
  );
}

/**
 * Image loader for Flyo CDN that automatically handles image transformations.
 * Adds Flyo CDN host if not already present and applies width transformations.
 * 
 * @param src - The image source URL (relative or absolute)
 * @param width - The desired width for the image
 * @returns Transformed image URL with Flyo CDN parameters
 * 
 * @example
 * ```tsx
 * <Image
 *   loader={flyoCdnLoader}
 *   src="me.png"
 *   alt="Picture"
 *   width={500}
 *   height={500}
 * />
 * ```
 */
export function flyoCdnLoader({ src, width }: ImageLoaderProps): string {
  let imageUrl = src;

  // If src doesn't contain the Flyo CDN host, prefix it
  if (!src.includes(FLYO_CDN_HOST)) {
    // Remove leading slash if present to avoid double slashes
    const cleanSrc = src.startsWith('/') ? src.slice(1) : src;
    imageUrl = `https://${FLYO_CDN_HOST}/${cleanSrc}`;
  }

  // Append Flyo CDN transformation parameters
  return `${imageUrl}/thumb/${width}xnull?format=webp`;
}

/**
 * FlyoMetric component for tracking entity metrics in production
 * 
 * Automatically sends a metric tracking request to the Flyo API when:
 * - The environment is production (NODE_ENV === 'production')
 * - The entity has a metric API URL configured
 * 
 * @param entity - The entity object containing entity_metric.api
 * 
 * @example
 * ```tsx
 * import { FlyoMetric } from '@flyo/nitro-next/client';
 * 
 * export default function BlogPost(props: RouteParams) {
 *   return nitroEntityRoute(props, {
 *     resolver,
 *     render: (entity: Entity) => (
 *       <>
 *         <FlyoMetric entity={entity} />
 *         <article>
 *           <h1>{entity.entity?.entity_title}</h1>
 *         </article>
 *       </>
 *     )
 *   });
 * }
 * ```
 */
export function FlyoMetric({ entity }: { entity: Entity }) {
  useEffect(() => {
    // Only track metrics in production and if API URL is available
    if (isProd && entity?.entity?.entity_metric?.api) {
      fetch(entity.entity.entity_metric.api);
    }
  }, [entity]);

  // This component doesn't render anything
  return null;
}

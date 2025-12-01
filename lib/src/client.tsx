'use client';

import { useEffect } from 'react';
import { highlightAndClick, wysiwyg, reload} from '@flyo/nitro-js-bridge';
import { Block } from "@flyo/nitro-typescript";

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

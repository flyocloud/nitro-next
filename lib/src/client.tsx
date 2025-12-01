'use client';

import { useEffect } from 'react';
import { highlightAndClick } from '@flyo/nitro-js-bridge';
import { Block } from "@flyo/nitro-typescript";

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

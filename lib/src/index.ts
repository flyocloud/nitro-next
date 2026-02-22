// Server exports only - use @flyo/nitro-next/client for client components
export {
  NitroBlock,
  NitroPage,
  NitroSlot,
  NitroDebugInfo,
  NitroEntityJsonLd,
  initNitro,
  getNitro,
  getNitroConfig,
  getNitroPages,
  getNitroEntities,
  getNitroSitemap,
  getNitroSearch,
  // Route helpers for Next.js app router - Pages
  nitroPageResolveRoute,
  nitroPageRoute,
  nitroPageGenerateMetadata,
  nitroPageGenerateStaticParams,
  // Route helpers for Next.js app router - Entities
  nitroEntityRoute,
  nitroEntityGenerateMetadata,
  // Sitemap helper for Next.js
  nitroSitemap,
  // Types
  type EntityResolver,
  type NitroState,
} from './server';

// Re-export types from Flyo SDK for convenience
export type { Entity, Block, Page, ConfigResponse } from '@flyo/nitro-typescript';

// Re-export client utilities for convenience
// FlyoCdnLoader is re-exported here because it's a pure utility function without React hooks
// or browser APIs, making it safe to use in Server Components (unlike FlyoMetric, FlyoWysiwyg, etc.)
// This allows developers to import it directly in Server Components without needing '/client'
// Note: Other client exports like FlyoMetric, FlyoWysiwyg, FlyoClientWrapper, editable, isProd
// are available via '@flyo/nitro-next/client'
export { FlyoCdnLoader } from './client';

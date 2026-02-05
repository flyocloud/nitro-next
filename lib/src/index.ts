// Server exports only - use @flyo/nitro-next/client for client components
export {
  NitroBlock,
  NitroPage,
  NitroSlot,
  NitroDebugInfo,
  initNitro,
  getNitro,
  getNitroConfig,
  getNitroPages,
  getNitroEntities,
  getNitroSitemap,
  getNitroSearch,
  // Route helpers for Next.js app router - Pages
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
// Note: Other client exports like FlyoMetric, FlyoWysiwyg, FlyoClientWrapper, editable, isProd
// are available via '@flyo/nitro-next/client'
export { flyoCdnLoader } from './client';

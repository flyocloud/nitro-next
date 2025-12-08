// Server exports only - use @flyo/nitro-next/client for client components
export {
  NitroBlock,
  NitroPage,
  initNitro,
  getNitroConfig,
  getNitroPages,
  getNitroEntities,
  // Route helpers for Next.js app router - Pages
  nitroPageRoute,
  nitroGenerateMetadata,
  nitroGenerateStaticParams,
  // Route helpers for Next.js app router - Entities
  nitroEntityRoute,
  nitroEntityGenerateMetadata,
  // Types
  type EntityResolver,
} from './server';

// Re-export types from Flyo SDK for convenience
export type { Entity, Block, Page } from '@flyo/nitro-typescript';

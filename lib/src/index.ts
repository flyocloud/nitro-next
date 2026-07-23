// Server exports only - use @flyo/nitro-next/client for client components
export {
  // Components
  NitroBlock,
  NitroPage,
  NitroSlot,
  NitroDebugInfo,
  NitroEntityJsonLd,
  // Initialization
  initNitro,
  // Factory functions for Next.js app router - Pages
  nitroPageRoute,
  nitroPageGenerateMetadata,
  nitroPageGenerateStaticParams,
  // Factory functions for Next.js app router - Entities
  nitroEntityRoute,
  nitroEntityGenerateMetadata,
  // i18n
  getLanguageLinks,
  NitroLanguageSwitcher,
  NitroLanguageLinks,
  // Types
  type FlyoInstance,
  type EntityResolver,
  type NitroState,
  type FlyoLanguageLink,
} from './server';

// Re-export types from Flyo SDK for convenience
export type { Entity, Block, Page, ConfigResponse, Translation } from '@flyo/nitro-typescript';

// Re-export client utilities for convenience
// FlyoCdnLoader is re-exported here because it's a pure utility function without React hooks
// or browser APIs, making it safe to use in Server Components (unlike FlyoMetric, FlyoWysiwyg, etc.)
// This allows developers to import it directly in Server Components without needing '/client'
// Note: Other client exports like FlyoMetric, FlyoWysiwyg, FlyoClientWrapper, editable, isProd
// are available via '@flyo/nitro-next/client'
export { FlyoCdnLoader } from './client';

// Server exports only - use @flyo/nitro-next/client for client components
export {
  NitroBlock,
  NitroPage,
  initNitro,
  getNitroConfig,
  getNitroPages,
  getNitroEntities,
  // New route helpers for Next.js app router
  nitroPageRoute,
  nitroGenerateMetadata,
  nitroGenerateStaticParams,
} from './server';

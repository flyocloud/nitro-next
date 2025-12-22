// Re-export the Nitro route handlers for a one-liner setup
export {
  nitroPageRoute as default,
  nitroPageGenerateMetadata as generateMetadata,
  // NOTE: generateStaticParams is commented out by default!
  // 
  // ⚠️ IMPORTANT: Only enable this in PRODUCTION builds!
  // 
  // When enabled, Next.js will pre-render ALL pages at build time, which:
  // - Disables dynamic caching completely
  // - Prevents live preview updates in the Nitro CMS editor
  // - Makes the preview frame unusable (you won't see changes anymore)
  // 
  // To enable in production only, use a conditional export:
  // ...(process.env.FLYO_LIVE_EDIT !== 'true' && {
  //   generateStaticParams: nitroPageGenerateStaticParams
  // })
  //
  // nitroPageGenerateStaticParams as generateStaticParams,
} from "@flyo/nitro-next/server";
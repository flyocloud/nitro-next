import { nitroPageRoute, nitroPageGenerateMetadata } from "@flyo/nitro-next/server";
import { flyo } from "@/flyo.config";

// Factory functions return handlers bound to the flyo instance
export default nitroPageRoute(flyo);
export const generateMetadata = nitroPageGenerateMetadata(flyo);

// NOTE: generateStaticParams is commented out by default!
// 
// ⚠️ IMPORTANT: Only enable this in PRODUCTION builds!
// 
// When enabled, Next.js will pre-render ALL pages at build time, which:
// - Disables dynamic caching completely
// - Prevents live preview updates in the Nitro CMS editor
// - Makes the preview frame unusable (you won't see changes anymore)
// 
// export const generateStaticParams = nitroPageGenerateStaticParams(flyo);
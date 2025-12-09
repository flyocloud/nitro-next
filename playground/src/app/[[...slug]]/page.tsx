// Re-export the Nitro route handlers for a one-liner setup
export {
  nitroPageRoute as default,
  nitroPageGenerateMetadata as generateMetadata,
  nitroPageGenerateStaticParams as generateStaticParams,
} from "@flyo/nitro-next/server";
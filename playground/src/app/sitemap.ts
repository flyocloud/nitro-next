import { flyo } from '@/flyo.config';

// Without this, Next.js treats sitemap.ts as a fully static route: it is
// rendered once at build time and never regenerated, so new pages and entities
// published in Flyo never reach sitemap.xml.
export const revalidate = 3600; // regenerate sitemap.xml at most hourly

export default async function sitemap() {
  return flyo.sitemap();
}

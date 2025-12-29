import { nitroSitemap } from '@flyo/nitro-next/server';
import { flyoConfig } from '../flyo.config';

export default async function sitemap() {
  return nitroSitemap(flyoConfig());
}

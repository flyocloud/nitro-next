import { FlyoNitroPage, getConfig, usePagesApi } from "@flyo/nitro-next";
import { notFound } from 'next/navigation';

export default async function Page({ params }: { params: { slug?: string[] } }) {
  // Import getConfig from the main package

  const slug = params.slug?.join('/') || '';
  
  const cfg = await getConfig();
  
  console.log('\n\n[SERVER PAGE COMPONENT - CONFIG]', cfg);

  if (!cfg.pages || !cfg.pages.includes(slug)) {
    notFound();
  }

  try {
    const api = usePagesApi();
    const page = await api.page({slug});

    console.log('\n\n[SERVER PAGE COMPONENT]\n\n', { slug, page });
  } catch (e) {
    console.error('Error fetching page:', e.response.url, slug);
  }

  return (
    <FlyoNitroPage page={page} />
  )
}
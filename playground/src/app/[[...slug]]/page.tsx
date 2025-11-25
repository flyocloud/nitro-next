import { FlyoNitroPage, useConfigApi, usePagesApi } from "@flyo/nitro-next";
import { notFound } from 'next/navigation';

export default async function Page({ params }: { params: { slug?: string[] } }) {
  
  const slug = params.slug?.join('/') ?? '';

  const cfg = await useConfigApi();

  if (!cfg.pages?.includes(slug)) {
    notFound();
  }

  const page = await usePagesApi()
    .page({ slug })
    .catch((error: unknown) => {
      console.error('Error fetching page:', slug, error);
      notFound(); // typed as never, so execution stops here
    });


  return (
    <FlyoNitroPage page={page} />
  )
}
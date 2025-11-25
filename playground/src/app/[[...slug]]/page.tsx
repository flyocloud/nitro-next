import { FlyoNitroPage, useConfigApi, usePagesApi } from "@flyo/nitro-next";
import { notFound } from 'next/navigation';

export default async function Page({
  params,
}: {
  params: Promise<{ slug: Array<string>|undefined }>
}) {
  const { slug } = await params;
  const path = slug?.join('/') ?? '';

  const cfg = await useConfigApi();

  if (!cfg.pages?.includes(path)) {
    notFound();
  }

  const page = await usePagesApi()
    .page({ slug: path })
    .catch((error: unknown) => {
      console.error('Error fetching page:', path, error);
      notFound(); // typed as never, so execution stops here
    });


  return (
    <FlyoNitroPage page={page} />
  )
}
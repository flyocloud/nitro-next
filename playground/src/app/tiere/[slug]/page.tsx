import { getEntitiesApi } from "@flyo/nitro-next/server";
import { notFound } from "next/navigation";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
    const { slug } = await params;

    console.log('Slug:', slug);


    const tier = await getEntitiesApi()
        .entityBySlug({ slug })
        .catch((error: unknown) => {
            console.error('Error fetching entity:', slug, error);
            notFound(); // typed as never, so execution stops here
        });

    console.log(tier)

    return (<div>hihi</div>)
}
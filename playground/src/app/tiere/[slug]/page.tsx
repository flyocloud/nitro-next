import { 
    nitroEntityRoute, 
    nitroEntityGenerateMetadata, 
    getNitroEntities,
    type EntityResolver
} from "@flyo/nitro-next/server";
import { FlyoMetric } from "@flyo/nitro-next/client";
import type { Entity } from "@flyo/nitro-typescript";

type RouteParams = {
    params: Promise<{ slug: string }>;
};

// Define the resolver - how to get the entity from route params
const resolver: EntityResolver<{ slug: string }> = async (params) => {
    const { slug } = await params;
    return getNitroEntities().entityBySlug({ 
        slug, 
        typeId: 172 
    });
};

export const generateMetadata = (props: RouteParams) => 
    nitroEntityGenerateMetadata(props, { resolver });

export default function Page(props: RouteParams) {
    return nitroEntityRoute(props, {
        resolver,
        render: (entity: Entity) => (
            <div>
                <FlyoMetric entity={entity} />
                <h1>{entity.entity?.entity_title}</h1>
                <p>{entity.entity?.entity_teaser}</p>
                <pre>{JSON.stringify(entity, null, 2)}</pre>
            </div>
        )
    });
}
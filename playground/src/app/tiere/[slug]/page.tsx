import { 
    nitroEntityRoute, 
    nitroEntityGenerateMetadata, 
    NitroEntityJsonLd,
    type EntityResolver
} from "@flyo/nitro-next/server";
import { flyo } from "@/flyo.config";
import { FlyoMetric } from "@flyo/nitro-next/client";
import type { Entity } from "@flyo/nitro-typescript";

// Define the resolver - how to get the entity from route params
const resolver: EntityResolver<{ slug: string }> = async (params) => {
    const { slug } = await params;
    return flyo.getNitroEntities().entityBySlug({ 
        slug, 
        typeId: 172 
    });
};

export const generateMetadata = nitroEntityGenerateMetadata(flyo, { resolver });

export default nitroEntityRoute(flyo, {
    resolver,
    render: (entity: Entity) => {
      return (
        <div>
          <NitroEntityJsonLd entity={entity} />
          <FlyoMetric entity={entity} />
          <h1>{entity.entity?.entity_title}</h1>
          <p>{entity.entity?.entity_teaser}</p>
          <pre>{JSON.stringify(entity, null, 2)}</pre>
        </div>
      );
    },
});
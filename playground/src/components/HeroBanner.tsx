'use client';

import { Block } from "@flyo/nitro-typescript";
import { editable } from "@flyo/nitro-next/client";

// The generic `Block` type carries `content` as an untyped object — in a real
// project you'd use the per-block types generated from your Flyo schema. For
// the playground demo, a local cast keeps it simple.
type HeroBannerContent = {
    title?: string;
    teaser?: string;
    image?: { source?: string; caption?: string };
};

export function HeroBanner({block}: {block: Block}) {
    const content = (block?.content ?? {}) as HeroBannerContent;

    return (
        <section {...editable(block)} className="bg-gray-200 p-8 rounded-lg text-center">
            <h2 className="text-3xl font-bold mb-4">
                { content.title }
            </h2>
            <p className="text-lg mb-6">
                { content.teaser }
            </p>

            <img src={content.image?.source} alt={content.image?.caption} className="mx-auto mb-6" />
        </section>
    );
}

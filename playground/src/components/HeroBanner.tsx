'use client';

import { Block } from "@flyo/nitro-typescript";

export function HeroBanner({block}: {block: Block}) {

    console.log(block);

    return (
        <section className="bg-gray-200 p-8 rounded-lg text-center">
            <h2 className="text-3xl font-bold mb-4">
                { block?.content?.title }
            </h2>
            <p className="text-lg mb-6">
                { block?.content?.teaser }
            </p>

            <img src={block?.content?.image?.source} alt={block?.content?.image?.caption} className="mx-auto mb-6" />
        </section>
    );
}
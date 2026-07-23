'use client';

import { Block } from "@flyo/nitro-typescript";
import { editable } from "@flyo/nitro-next/client";

import { FlyoWysiwyg, type WysiwygJson } from '@flyo/nitro-next/client';
import CustomImage from "./wysiwyg/CustomImage";

// See HeroBanner: generic `Block.content` is untyped — cast locally for the demo.
type TextContent = {
    content?: { json?: WysiwygJson };
};

export function Text({block}: {block: Block}) {
    const content = (block?.content ?? {}) as TextContent;

    return (
        <div {...editable(block)} style={{ whiteSpace: 'pre-wrap', padding: '1rem', margin: '2rem 0', backgroundColor: '#f9f9f9' }}>
            <FlyoWysiwyg json={content.content?.json ?? []}
                components={{
                    image: CustomImage
                }}
            />
        </div>
    );
}

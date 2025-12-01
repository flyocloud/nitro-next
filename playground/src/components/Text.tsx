'use client';

import { Block } from "@flyo/nitro-typescript";
import { editable } from "@flyo/nitro-next/client";

import { FlyoWysiwyg } from '@flyo/nitro-next/client';
import CustomImage from "./wysiwyg/CustomImage";


export function Text({block}: {block: Block}) {
    
    return (
        <div {...editable(block)} style={{ whiteSpace: 'pre-wrap', padding: '1rem', margin: '2rem 0', backgroundColor: '#f9f9f9' }}>
            <FlyoWysiwyg json={block.content.content.json}
                components={{
                    image: CustomImage
                }}
            />
        </div>
    );
}
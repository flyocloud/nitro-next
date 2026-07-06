# Flyo Nitro CMS integration advisory for an existing Next.js project
You are a coding agent working inside an existing Next.js project. Your goal is to integrate Flyo Nitro CMS using `@flyo/nitro-next`.

Repository and documentation:

- Package repository: `https://github.com/flyocloud/nitro-next`
- Developer README: `https://github.com/flyocloud/nitro-next/blob/main/README.md`

## Important constraints
This integration is for **Next.js App Router only**.

Before changing files, verify that the project uses the `app/` directory. If the project uses the legacy `pages/` router, stop and explain that `@flyo/nitro-next` is not compatible with that setup.

This project does **not** use a `src/` folder. Use the root-level `app/` structure.

Use these conventions:

```
app/generated/flyo.ts
app/components/layout/Header.tsx
app/components/layout/Footer.tsx
app/components/flyo/FlyoImage.tsx
app/components/flyo/wysiwyg/AppWysiwyg.tsx
app/components/flyo/blocks
```
Do not hardcode secrets into source files. The Flyo access token must be stored in environment variables.

Use TypeScript where the project supports it.

Prefer small, clean, reusable components.

## First interaction with the user
Before implementing, ask the user for the following required information.

### 1. Flyo Nitro access token
Ask for the Flyo access token that should be used for this project.

Store it in `.env.local` as:

```
FLYO_ACCESS_TOKEN=<token>
FLYO_LIVE_EDIT=true
SITE_URL=http://localhost:3000
```
For production, the environment should contain:

```
FLYO_ACCESS_TOKEN=<production-token>
FLYO_LIVE_EDIT=false
SITE_URL=https://example.com
```
Do not commit real tokens.

### 2. Available Flyo container identifiers
Ask which Flyo config containers exist and should be used in the layout.

Common examples:

```
nav
navbar
navigation
main_navigation
footer
```
Ask the user specifically:

```
Which Flyo container identifier should be used for the main navigation?
Which Flyo container identifier should be used for the footer?
```
Use those identifiers in the `Header` and `Footer` components.

The components should not be named `FlyoHeader` or `FlyoFooter`, because they are regular layout components. Use neutral layout names:

```
app/components/layout/Header.tsx
app/components/layout/Footer.tsx
```

## Implementation steps

### 1. Install the package
Install the Flyo Nitro Next.js package:

```
npm install @flyo/nitro-next
```
Use the project's package manager if it is clearly not npm:

```
pnpm add @flyo/nitro-next
```
or:

```
yarn add @flyo/nitro-next
```

### 2. Create `flyo.config.tsx`
Create this file at the project root:

```
flyo.config.tsx
```
Use this as the initial structure:

```
import type { ReactNode } from 'react';
import { initNitro } from '@flyo/nitro-next/server';
import { FlyoClientWrapper } from '@flyo/nitro-next/client';

const accessToken = process.env.FLYO_ACCESS_TOKEN || '';
const liveEdit = process.env.FLYO_LIVE_EDIT === 'true';
const baseUrl = process.env.SITE_URL || 'http://localhost:3000';

export const flyo = initNitro({
  accessToken,
  lang: 'en',
  baseUrl,
  liveEdit,
  serverCacheTtl: 1200,
  clientCacheTtl: 900,
  components: {
    // Block components will be registered here after they are generated.
    // Use the Claude skill created later in this advisory to generate and register them.
  },
});

export function FlyoProvider({ children }: { children: ReactNode }) {
  if (liveEdit) {
    return <FlyoClientWrapper>{children}</FlyoClientWrapper>;
  }

  return <>{children}</>;
}
```
Adjust `lang` if the project uses another default language.

Do not create real block components yet unless the generated Flyo types are already available.

### 3. Add proxy cache handling
Create this file at the project root:

```
proxy.ts
```
Use:

```
import { createProxy } from '@flyo/nitro-next/proxy';
import { flyo } from './flyo.config';

export default createProxy(flyo);

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```
Keep `proxy.ts` at the project root because the project uses a root-level `app/` directory and no `src/` directory.

### 4. Generate Flyo TypeScript definitions
Create the generated types directory:

```
app/generated
```
Add this script to `package.json`:

```
{
  "scripts": {
    "flyo:types": "npx -y openapi-typescript@latest 'https://api.flyo.cloud/nitro/v1/openapi/schemas?token=$FLYO_ACCESS_TOKEN' -o ./app/generated/flyo.ts --root-types --root-types-no-schema-prefix --export-type"
  }
}
```
Then run:

```
npm run flyo:types
```
The direct command is:

```
npx -y openapi-typescript@latest 'https://api.flyo.cloud/nitro/v1/openapi/schemas?token=flyotoken' -o ./app/generated/flyo.ts --root-types --root-types-no-schema-prefix --export-type
```
Replace `flyotoken` with the real Flyo access token.

If shell variable expansion inside the npm script is problematic on the current platform, temporarily run the direct command with the token locally. Do not commit the token.

### 5. Create neutral layout `Header` and `Footer` components
Create:

```
app/components/layout/Header.tsx
app/components/layout/Footer.tsx
```
Use the user-provided Flyo container identifiers.

Example `Header.tsx`:

```
import Link from 'next/link';
import { flyo } from '@/flyo.config';

const NAV_CONTAINER_KEY = 'nav';

export async function Header() {
  const config = await flyo.getNitroConfig();
  const items = config?.containers?.[NAV_CONTAINER_KEY]?.items ?? [];

  if (!items.length) {
    return null;
  }

  return (
    <header>
      <nav aria-label="Main navigation">
        <ul>
          {items.map((item, index) => (
            <li key={`${item.href}-${index}`}>
              <Link href={item.href} target={item.target}>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
```
Example `Footer.tsx`:

```
import Link from 'next/link';
import { flyo } from '@/flyo.config';

const FOOTER_CONTAINER_KEY = 'footer';

export async function Footer() {
  const config = await flyo.getNitroConfig();
  const items = config?.containers?.[FOOTER_CONTAINER_KEY]?.items ?? [];

  if (!items.length) {
    return null;
  }

  return (
    <footer>
      <nav aria-label="Footer navigation">
        <ul>
          {items.map((item, index) => (
            <li key={`${item.href}-${index}`}>
              <Link href={item.href} target={item.target}>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </footer>
  );
}
```
Replace `NAV_CONTAINER_KEY` and `FOOTER_CONTAINER_KEY` with the actual identifiers provided by the user.

If the shape of the config container items differs from this example, inspect the returned config structure or generated types and adapt the rendering safely.

### 6. Update the root layout
Update:

```
app/layout.tsx
```
Wrap the app with `FlyoProvider`.

Add `Header`, `Footer` and `NitroDebugInfo`.

Example:

```
import { FlyoProvider, flyo } from '@/flyo.config';
import { NitroDebugInfo } from '@flyo/nitro-next/server';
import { Header } from '@/app/components/layout/Header';
import { Footer } from '@/app/components/layout/Footer';

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <FlyoProvider>
      <html lang="en">
        <body>
          <Header />
          <NitroDebugInfo flyo={flyo} />
          {children}
          <Footer />
        </body>
      </html>
    </FlyoProvider>
  );
}
```
Preserve any existing fonts, metadata, providers, analytics, styling imports and body classes from the existing layout.

Do not blindly overwrite the existing layout. Merge the Flyo integration into it.

If the project has an existing provider component, nest `FlyoProvider` in a way that does not break the existing provider tree.

### 7. Create the wildcard catch-all page route
Create:

```
app/[[...slug]]/page.tsx
```
Use:

```
import {
  nitroPageRoute,
  nitroPageGenerateMetadata,
  // nitroPageGenerateStaticParams,
} from '@flyo/nitro-next/server';
import { flyo } from '@/flyo.config';

export default nitroPageRoute(flyo);

export const generateMetadata = nitroPageGenerateMetadata(flyo);

// Only enable this for production builds when static generation is desired.
// Do not enable it during Nitro live editing, because it prevents dynamic preview updates.
// export const generateStaticParams = nitroPageGenerateStaticParams(flyo);
```
If the existing project already has a catch-all route or route groups, inspect the routing structure first and integrate without breaking existing routes.

### 8. Prepare a project WYSIWYG wrapper
Most Flyo Nitro projects use WYSIWYG fields. Create a reusable wrapper even if there are no custom nodes yet.

Create:

```
app/components/flyo/wysiwyg/AppWysiwyg.tsx
```
Use:

```
'use client';

import {
  FlyoWysiwyg,
  type WysiwygJson,
} from '@flyo/nitro-next/client';

export function AppWysiwyg({
  json,
  className = 'wysiwyg',
}: {
  json: WysiwygJson;
  className?: string;
}) {
  return (
    <FlyoWysiwyg
      json={json}
      className={className}
      components={{
        // Add custom WYSIWYG node components here later.
      }}
    />
  );
}
```
Use this wrapper in Flyo block components whenever a block contains WYSIWYG JSON.

### 9. Create a Flyo image component using the CDN loader
Create:

```
app/components/flyo/FlyoImage.tsx
```
Use the Flyo CDN loader with Next.js Image:

```
'use client';

import Image, { type ImageProps } from 'next/image';
import { FlyoCdnLoader } from '@flyo/nitro-next/client';

type FlyoImageProps = Omit<ImageProps, 'loader'>;

export function FlyoImage(props: FlyoImageProps) {
  return <Image loader={FlyoCdnLoader} {...props} />;
}
```
Use this component for Flyo media fields where width and height are known or can be safely provided.

Example usage inside a future block component:

```
<FlyoImage
  src={block.content.image.source}
  alt={block.content.image.caption || ''}
  width={800}
  height={600}
/>
```

### 10. Create a reusable Claude skill for building a named Flyo block
Do not manually add a full block convention section to the advisory only. Instead, create a reusable Claude skill that future agents can use to build or update **one named Flyo block at a time**, driven by a design brief or by an existing component that should be converted into a block.

This skill is invoked with a block **name** and a **design intent**, for example:

```
Use the flyo-block skill. Block: Hero. Create a decent-looking, responsive hero block based on the hero design.
```

```
Use the flyo-block skill. Block: Hero. Convert the existing HeroBanner component into a Flyo hero block and keep its look and feel.
```

```
Use the flyo-block skill. Block: Teaser. Update the existing Teaser block to match the new card design.
```

The skill is therefore not a bulk generator. It focuses on translating a design (a brief, a screenshot, or an existing React component) into a single, well-crafted, type-safe Flyo block, and registering it.

Create:

```
.claude/skills/flyo-block/SKILL.md
```
Use this content:

````
---
name: flyo-block
description: Create or update a single named Flyo Nitro CMS block for this Next.js App Router project, driven by a design brief or by converting an existing React component into a block. Use when the user names a block (e.g. "Hero") and describes how it should look or points to an existing component to base it on.
---

# Flyo block builder skill

Use this skill to create or update **one named Flyo Nitro CMS block** at a time.

This skill is design-driven. It is invoked with:

- a block **name** (for example `Hero`, `Teaser`, `Gallery`), and
- a **design intent**, which is one of:
  - a written design brief ("a decent-looking, responsive hero with headline, lead text and a CTA"),
  - a reference to an existing component to convert into a block ("base it on the existing `HeroBanner` component"),
  - a visual reference (screenshot / mockup) the user provides.

The goal is to translate that design intent into a single, polished, type-safe Flyo block and register it.

## Project context

This project uses:

```txt
Next.js App Router
@flyo/nitro-next
No src folder
Root-level app directory
```

Generated Flyo types are located at:

```txt
app/generated/flyo.ts
```

Flyo block components should be placed in:

```txt
app/components/flyo/blocks
```

Shared Flyo helpers are available at:

```txt
app/components/flyo/wysiwyg/AppWysiwyg.tsx
app/components/flyo/FlyoImage.tsx
flyo.config.tsx
```

## Inputs to resolve first

Before writing code, make sure you know:

1. The **block name** the user wants (used for the file name, component name and registration key).
2. Whether this is a **create** (new block) or an **update** (an existing block file already exists).
3. The **design source**:
   - a brief in the prompt, or
   - an existing component/file to convert or match, or
   - a visual reference.
4. The matching **generated block type** in `app/generated/flyo.ts`.

If the user only gives a name and a design but there is no matching type in `app/generated/flyo.ts`, ask them to confirm the CMS block identifier (or run `npm run flyo:types`) before inventing fields.

## Main task

When asked to build a named block:

1. Inspect `app/generated/flyo.ts` and find the generated type that matches the requested block name.
2. If converting an existing component, read that component fully and note its markup, styling approach, props and layout.
3. Map the design's visual pieces (heading, text, image, buttons, background, layout) onto the block's real CMS fields from the generated type.
4. Create or update the block component in `app/components/flyo/blocks` using the block name (for example `HeroBlock.tsx`).
5. Implement the design faithfully: responsive layout, sensible spacing, and the project's existing design system where one exists.
6. Use `AppWysiwyg` for WYSIWYG JSON fields.
7. Use `FlyoImage` for Flyo media/image fields where possible.
8. Use `editable(block)` only in client components.
9. Use `NitroSlot` for nested slot rendering.
10. Register (or confirm registration of) the block in `flyo.config.tsx`.
11. Keep the implementation focused on the single named block; do not generate unrelated blocks.

## Converting an existing component into a block

When the user points to an existing component ("base it on the existing `HeroBanner`"):

1. Read the referenced component and preserve its look and feel (class names, layout, spacing, variants).
2. Replace its hardcoded/static props with the block's CMS fields from `app/generated/flyo.ts`.
3. Keep the original styling and structure; only swap the data source and add the Flyo wiring (`editable`, `AppWysiwyg`, `FlyoImage`, slots).
4. If the original component should stay as a presentational component, you may keep it and have the block wrap it, passing CMS values as props — whichever keeps the design intact with the least duplication.

## Design guidance

- Match the requested design intent, not a generic template. If the user asks for a "decent-looking" layout, produce a genuinely polished, responsive result.
- Reuse the project's existing components, typography helpers, buttons and layout primitives if they already exist.
- Only introduce new styling when the project has no clear design system to follow, and keep it consistent with what already exists.
- Keep the block responsive and accessible (semantic elements, alt text, focusable controls).

## Important rules

Always inspect `app/generated/flyo.ts` before creating or updating a block.

Do not guess field names if the generated type definitions are available.

Use optional chaining for CMS fields unless the generated type guarantees that a field is required.

Keep the block component readable and scoped to the one named block.

Do not invent a fake block type that does not exist in the generated types.

## Client component pattern

Use this when the block does not render nested Flyo slots and needs `editable(block)`:

```tsx
'use client';

import { editable } from '@flyo/nitro-next/client';
import type { BlockExample } from '@/app/generated/flyo';

export function ExampleBlock({ block }: { block: BlockExample }) {
  return (
    <section {...editable(block)}>
      {/* Render block.content fields here */}
    </section>
  );
}
```

## Server component pattern with slots

Use this when the block renders nested blocks through slots:

```tsx
import { NitroSlot } from '@flyo/nitro-next/server';
import { EditableSection } from '@flyo/nitro-next/client';
import { flyo } from '@/flyo.config';
import type { BlockExampleContainer } from '@/app/generated/flyo';

export function ExampleContainerBlock({
  block,
}: {
  block: BlockExampleContainer;
}) {
  return (
    <EditableSection block={block}>
      <NitroSlot slot={block.slots?.content} flyo={flyo} />
    </EditableSection>
  );
}
```

## WYSIWYG usage

```tsx
import { AppWysiwyg } from '@/app/components/flyo/wysiwyg/AppWysiwyg';

{block.content?.text ? (
  <AppWysiwyg json={block.content.text} />
) : null}
```

## Image usage

```tsx
import { FlyoImage } from '@/app/components/flyo/FlyoImage';

{block.content?.image?.source ? (
  <FlyoImage
    src={block.content.image.source}
    alt={block.content.image.caption || ''}
    width={800}
    height={600}
  />
) : null}
```

## Registering the block

After creating or updating the named block component, make sure it is registered in `flyo.config.tsx`.

Example:

```tsx
import { ExampleBlock } from '@/app/components/flyo/blocks/ExampleBlock';

export const flyo = initNitro({
  accessToken,
  lang: 'en',
  baseUrl,
  liveEdit,
  serverCacheTtl: 1200,
  clientCacheTtl: 900,
  components: {
    ExampleBlock,
  },
});
```

If several blocks exist:

```tsx
components: {
  HeroBlock,
  TextBlock,
  ImageBlock,
  ContainerBlock,
}
```

The registered component key must match what Flyo Nitro expects from the CMS block definition for this block.

## Final checklist after building the block

- The named block file exists in `app/components/flyo/blocks` (created or updated).
- The block imports the correct generated type from `app/generated/flyo.ts`.
- The design intent (brief, reference component, or mockup) is faithfully implemented and responsive.
- If converting an existing component, its look and feel is preserved.
- WYSIWYG fields use `AppWysiwyg`.
- Images use `FlyoImage` where possible.
- Slot rendering uses `NitroSlot` with `flyo`.
- Components using `editable(block)` are client components.
- The block is registered in `flyo.config.tsx`.
- TypeScript passes.
````

This replaces the earlier manual "Prepare starter Flyo block component convention" section and removes the separate block registration step from the main setup flow. Building a named block from a design (or from an existing component) and registering it are now handled by the reusable Claude skill.

### 11. Create sitemap support
Create:

```
app/sitemap.ts
```
Use:

```
import { flyo } from '@/flyo.config';

export default async function sitemap() {
  return flyo.sitemap();
}
```
Ensure `SITE_URL` is configured correctly in production.

### 12. Validation checklist
After implementation, run:

```
npm run flyo:types
npm run lint
npm run build
```
If the project has no lint script, skip lint and run the available type-check/build scripts.

Verify:

```
.env.local contains FLYO_ACCESS_TOKEN
flyo.config.tsx exists and exports flyo and FlyoProvider
proxy.ts exists at the project root
app/layout.tsx is wrapped with FlyoProvider
app/components/layout/Header.tsx exists
app/components/layout/Footer.tsx exists
Header and Footer use the user-provided Flyo container identifiers
app/generated/flyo.ts exists
app/[[...slug]]/page.tsx exists
app/components/flyo/wysiwyg/AppWysiwyg.tsx exists
app/components/flyo/FlyoImage.tsx exists
app/sitemap.ts exists
.claude/skills/flyo-block/SKILL.md exists
The project builds successfully
```

## Follow-up workflow after setup
After the base integration is complete, the next step is to build real Flyo block components from your designs, one named block at a time.

Use the created Claude skill:

```
.claude/skills/flyo-block/SKILL.md
```
Then ask the agent per block, providing a name and a design intent. Examples:

```
Use the flyo-block skill. Block: Hero. Create a decent-looking, responsive hero block based on the hero design.
```

```
Use the flyo-block skill. Block: Hero. Convert the existing HeroBanner component into a Flyo hero block and keep its look and feel.
```

```
Use the flyo-block skill. Block: Teaser. Update the existing Teaser block to match the new card design.
```

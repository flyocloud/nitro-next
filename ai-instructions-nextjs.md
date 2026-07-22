# Flyo Nitro CMS integration advisory for an existing Next.js project
You are a coding agent working inside an existing Next.js project. Your goal is to integrate Flyo Nitro CMS using `@flyo/nitro-next`.

Repository and documentation:

- Package repository: `https://github.com/flyocloud/nitro-next`
- Developer README: `https://github.com/flyocloud/nitro-next/blob/main/README.md`

## Important constraints
This integration is for **Next.js App Router only**.

Before changing files, verify that the project uses the `app/` directory. If the project uses the legacy `pages/` router, stop and explain that `@flyo/nitro-next` is not compatible with that setup.

This project does **not** use a `src/` folder. Use the root-level `app/` structure.

Only Next.js **routing files** belong inside `app/` — route segments, `layout.tsx`, `page.tsx`, `not-found.tsx`, `sitemap.ts` and route handlers. Everything else is **global, app-wide code** and lives at the **project root** as siblings of `app/` — never inside it. This means `flyo.config.tsx`, `proxy.ts`, reusable `components/`, and the `generated/` types directory all sit at the root, next to `app/`.

Use these conventions:

```
flyo.config.tsx                              # project root
proxy.ts                                     # project root
generated/flyo.ts                            # root-level, NOT app/generated
components/layout/Header.tsx                 # root-level, NOT app/components
components/layout/Footer.tsx
components/flyo/FlyoImage.tsx
components/flyo/wysiwyg/AppWysiwyg.tsx
components/flyo/blocks
```

Do **not** place components, blocks, WYSIWYG helpers or generated types under `app/`. They are not routes.

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
components/layout/Header.tsx
components/layout/Footer.tsx
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
Adjust `lang` if the project uses another default language. For a **multilingual** project, set `defaultLocale` and `locales` instead — see the Multilanguage step below.

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
generated
```
Add this script to `package.json`:

```
{
  "scripts": {
    "flyo:types": "npx -y openapi-typescript@latest 'https://api.flyo.cloud/nitro/v1/openapi/schemas?token=$FLYO_ACCESS_TOKEN' -o ./generated/flyo.ts --root-types --root-types-no-schema-prefix --export-type"
  }
}
```
Then run:

```
npm run flyo:types
```
The direct command is:

```
npx -y openapi-typescript@latest 'https://api.flyo.cloud/nitro/v1/openapi/schemas?token=flyotoken' -o ./generated/flyo.ts --root-types --root-types-no-schema-prefix --export-type
```
Replace `flyotoken` with the real Flyo access token.

If shell variable expansion inside the npm script is problematic on the current platform, temporarily run the direct command with the token locally. Do not commit the token.

### 5. Create neutral layout `Header` and `Footer` components
Create:

```
components/layout/Header.tsx
components/layout/Footer.tsx
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
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

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
components/flyo/wysiwyg/AppWysiwyg.tsx
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
components/flyo/FlyoImage.tsx
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

Global, app-wide code (config, components, blocks, generated types) lives at the **project root** as a sibling of `app/`. Only routing files (route segments, `layout.tsx`, `page.tsx`, `not-found.tsx`, `sitemap.ts`) go inside `app/`.

Generated Flyo types are located at:

```txt
generated/flyo.ts
```

Flyo block components should be placed in:

```txt
components/flyo/blocks
```

Shared Flyo helpers are available at:

```txt
components/flyo/wysiwyg/AppWysiwyg.tsx
components/flyo/FlyoImage.tsx
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
4. The matching **generated block type** in `generated/flyo.ts`.

If the user only gives a name and a design but there is no matching type in `generated/flyo.ts`, ask them to confirm the CMS block identifier (or run `npm run flyo:types`) before inventing fields.

## Main task

When asked to build a named block:

1. Inspect `generated/flyo.ts` and find the generated type that matches the requested block name.
2. If converting an existing component, read that component fully and note its markup, styling approach, props and layout.
3. Map the design's visual pieces (heading, text, image, buttons, background, layout) onto the block's real CMS fields from the generated type.
4. Create or update the block component in `components/flyo/blocks` using the block name (for example `HeroBlock.tsx`).
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
2. Replace its hardcoded/static props with the block's CMS fields from `generated/flyo.ts`.
3. Keep the original styling and structure; only swap the data source and add the Flyo wiring (`editable`, `AppWysiwyg`, `FlyoImage`, slots).
4. If the original component should stay as a presentational component, you may keep it and have the block wrap it, passing CMS values as props — whichever keeps the design intact with the least duplication.

## Design guidance

- Match the requested design intent, not a generic template. If the user asks for a "decent-looking" layout, produce a genuinely polished, responsive result.
- Reuse the project's existing components, typography helpers, buttons and layout primitives if they already exist.
- Only introduce new styling when the project has no clear design system to follow, and keep it consistent with what already exists.
- Keep the block responsive and accessible (semantic elements, alt text, focusable controls).

## Important rules

Always inspect `generated/flyo.ts` before creating or updating a block.

Do not guess field names if the generated type definitions are available.

Use optional chaining for CMS fields unless the generated type guarantees that a field is required.

Keep the block component readable and scoped to the one named block.

Do not invent a fake block type that does not exist in the generated types.

## Client component pattern

Use this when the block does not render nested Flyo slots and needs `editable(block)`:

```tsx
'use client';

import { editable } from '@flyo/nitro-next/client';
import type { BlockExample } from '@/generated/flyo';

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
import type { BlockExampleContainer } from '@/generated/flyo';

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
import { AppWysiwyg } from '@/components/flyo/wysiwyg/AppWysiwyg';

{block.content?.text ? (
  <AppWysiwyg json={block.content.text} />
) : null}
```

## Image usage

```tsx
import { FlyoImage } from '@/components/flyo/FlyoImage';

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
import { ExampleBlock } from '@/components/flyo/blocks/ExampleBlock';

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

- The named block file exists in `components/flyo/blocks` (created or updated).
- The block imports the correct generated type from `generated/flyo.ts`.
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

### 12. Optional: Multilanguage (i18n)
If the Flyo project is multilingual, make the integration locale-aware. Ask the user:

```
Is the site multilingual? If so, what is the primary language and which locales are used (e.g. de, en)?
```

If it is single-language, skip this step. For a multilingual project:

1. Declare the locales in `flyo.config.tsx`:

```
export const flyo = initNitro({
  accessToken,
  baseUrl,
  liveEdit,
  defaultLocale: 'de',      // primary language (config.nitro.primary_language)
  locales: ['de', 'en'],    // all supported locales
  serverCacheTtl: 1200,
  clientCacheTtl: 900,
  components: { /* … */ },
});
```

2. No change to `proxy.ts` — with `locales` configured, the proxy detects the locale from the first URL segment and sets an `x-flyo-locale` header for Server Components. Localized pages already resolve through the catch-all route, because page slugs are locale-prefixed and globally unique.

3. In `app/layout.tsx`, set `<html lang>` from the localized config you already fetch there — its `nitro.language` is the resolved locale (no need for a separate `getRequestLocale()` call):

```
const config = await flyo.getNitroConfig(); // localized to the active request locale
const lang = config.nitro?.language;        // the language this config resolved in
// <html lang={lang}> …
```

4. Entity detail routes carry the locale as a route segment, because an entity's slug is shared across languages and needs `lang` to select the language. Use `app/[lang]/<segment>/[slug]/page.tsx` and pass `params.lang`:

```
const resolver: EntityResolver<{ lang: string; slug: string }> = async (params) => {
  const { lang, slug } = await params;
  return flyo.getNitroEntities().entityBySlug({ slug, typeId: <id>, lang });
};
```

5. Language switcher. The switcher usually lives in *shared chrome* (a footer) in the root layout, which is an **ancestor** of the page and cannot receive `page.translation` as a prop. A request-scoped store bridges it: the active route **publishes** the links, the footer **reads** them.

   - **Page and entity routes publish automatically** (`pageResolveRoute` / `nitroPageRoute` / `nitroEntityRoute` / `nitroEntityGenerateMetadata`) — no code needed. If the site is multilingual, build one `LanguageSwitcher` server component that reads the store, and drop it into the footer (or wherever), wrapped in `<Suspense>`:

     ```
     // components/LanguageSwitcher.tsx
     import { readLanguageLinks } from '@flyo/nitro-next/server';
     const links = await readLanguageLinks();
     if (links.length === 0) return null; // single-language site → no switcher
     // render links.map(...) as native <a> (see below)
     ```

   - **Only routes Flyo does not resolve** (a hand-written page, `not-found.tsx`) must publish themselves, or `readLanguageLinks()` waits forever. `publishLanguageLinks()` takes a plain `FlyoLanguageLink[]`, so set them by hand — real links if the route is localized, or an empty array (or `getLanguageLinks(undefined, { currentLang, locales })` for disabled fallback entries) when it is not:

     ```
     import { publishLanguageLinks } from '@flyo/nitro-next/server';
     publishLanguageLinks([]); // not-found / non-localized route: hide the switcher
     ```

**Render the switcher links as native `<a href={l.href}>` elements — never `next/link`'s `<Link>`.** A language switch has to refresh the shared chrome (localized nav, footer, `<html lang>`) that lives in the root layout, and App Router soft navigation re-renders only the page segment — a `<Link>` switcher leaves the header/footer/`<html lang>` stuck in the old language while only the page body updates. A plain `<a>` forces a full-document navigation and a fresh server render in the new locale. Keep the ordinary nav links in the layout as `<Link>` (soft nav is correct there, since the nav is identical within a language).

`hreflang` alternates are emitted automatically by `nitroPageGenerateMetadata` / `nitroEntityGenerateMetadata`.

See the "Multilanguage (i18n)" section of the README for full details.

### 13. Create or update `AGENTS.md` so future agents have Flyo context
So that any AI coding agent that works on this project later (Claude Code, Copilot, Cursor, etc.) automatically knows it is built on Flyo Nitro CMS and where to read the full library documentation, create — or update, if one already exists — an `AGENTS.md` file at the **project root**.

`AGENTS.md` is the vendor-neutral convention that most coding agents read on startup. If the project already uses a tool-specific memory file such as `CLAUDE.md`, add the same Flyo section there as well (or have that file point at `AGENTS.md`). This mirrors the example `AGENTS.md` in the Flyo Nitro README: <https://github.com/flyocloud/nitro-next/blob/main/README.md#example-agentsmd>.

Add a Flyo section that **self-references this library's documentation**, so the agent can pull in the full integration context (usage, API reference and this advisory) on demand while coding against the Flyo Nitro CMS library:

```markdown
# Flyo Nitro CMS

This project uses the **Flyo Nitro** headless CMS via `@flyo/nitro-next` to manage its content. Pages are composed of CMS-driven blocks, plus entities and containers, rendered with the Next.js App Router.

When working on any Flyo/Nitro code (blocks, entities, `flyo.config.tsx`, proxy, layout, sitemap), consult these sources for the full context of the library:

- Usage guide & API reference: https://github.com/flyocloud/nitro-next#usage
- AI integration advisory (raw): https://raw.githubusercontent.com/flyocloud/nitro-next/refs/heads/main/ai-instructions-nextjs.md
- Full Nitro CMS documentation: https://docs.flyo.cloud/doc/integrations-nitro-cms

Project conventions:

- Next.js App Router, no `src/` folder.
- Global, app-wide code (`flyo.config.tsx`, `proxy.ts`, `components/`, `generated/`) lives at the project root as a sibling of `app/`. Only routing files live in `app/`.
- Flyo block components live in `components/flyo/blocks` and are registered in `flyo.config.tsx`.
- Regenerate types with `npm run flyo:types` whenever CMS block fields change.
- Build one named block at a time with the `.claude/skills/flyo-block` skill.
```

If an `AGENTS.md` already exists, **merge** this Flyo section into it rather than overwriting the file — preserve any existing project instructions.

### 14. Validation checklist
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
components/layout/Header.tsx exists
components/layout/Footer.tsx exists
Header and Footer use the user-provided Flyo container identifiers
generated/flyo.ts exists
app/[[...slug]]/page.tsx exists
components/flyo/wysiwyg/AppWysiwyg.tsx exists
components/flyo/FlyoImage.tsx exists
app/sitemap.ts exists
.claude/skills/flyo-block/SKILL.md exists
AGENTS.md exists at the project root and references the Flyo Nitro docs (github.com/flyocloud/nitro-next#usage and the raw ai-instructions-nextjs.md)
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

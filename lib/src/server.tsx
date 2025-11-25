import {
  Page,
  Block,
  ConfigApi,
  ConfigResponse,
  Configuration,
  PagesApi,
  EntitiesApi
} from '@flyo/nitro-typescript';

let globalConfiguration: Configuration | null = null;
let configResponse: ConfigResponse | null = null;
let configPromise: Promise<ConfigResponse> | null = null;
let globalLang: string | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let globalComponents: Record<string, any> = {};

export const FlyoNitroConfiguration = ({accessToken, lang, components}: {accessToken: string, lang?: string, components?: object}): ( () => Configuration )   => {

    if (!globalConfiguration) {
      globalConfiguration = new Configuration({
        apiKey: accessToken,
      });
    }

    globalLang = lang ?? null;
    globalComponents = components ?? {};

    return () => globalConfiguration!;
}

export async function getConfig(): Promise<ConfigResponse> {

    console.log('\n[getConfig] call');

    if (configResponse) {
      return configResponse;
    }

    if (configPromise) {
      return configPromise;
    }

    const configApi = new ConfigApi(globalConfiguration!);
    const useLang = globalLang ?? undefined;

    configPromise = configApi
      .config({ lang: useLang })
      .then((config) => {
        configResponse = config;
        return config;
      })
      .finally(() => {
        configPromise = null;
        console.log('\n[getConfig] fetched config');
      });

    return configPromise;
}

export function getPagesApi(): PagesApi {
  return new PagesApi(globalConfiguration!);
}

export function getEntitiesApi(): EntitiesApi {
  return new EntitiesApi(globalConfiguration!);
}


/**
 * FlyoNitroPage component renders all blocks from a Flyo page
 */
export function FlyoNitroPage({
  page,
}: {
  page: Page
}) {
  if (!page?.json || !Array.isArray(page.json)) {
    return null;
  }

  return (
    <>
      {page.json.map((block: Block, index: number) => (
        <FlyoNitroBlock
          key={block.uid || index}
          block={block}
        />
      ))}
    </>
  );
}

export function FlyoNitroBlock({
  block,
}: {
  block: Block
}) {
  if (!block) {
    return null;
  }

  const Component = block.component ? globalComponents[block.component] : undefined;

  if (Component) {
    return <Component block={block} />;
  }

  return (
    <div>
      {/* Render block content here */}
      <pre>{JSON.stringify(block, null, 2)}</pre>
    </div>
  );
}
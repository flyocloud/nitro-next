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

export const initNitro = ({accessToken, lang, components}: {accessToken: string, lang?: string, components?: object}): ( () => Configuration )   => {

    if (!globalConfiguration) {
      globalConfiguration = new Configuration({
        apiKey: accessToken,
      });
    }

    globalLang = lang ?? null;
    globalComponents = components ?? {};

    return () => globalConfiguration!;
}

export async function getNitroConfig(): Promise<ConfigResponse> {

    console.log('\n[getNitroConfig] call');

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
        console.log('\n[getNitroConfig] fetched config');
      });

    return configPromise;
}

export function getNitroPages(): PagesApi {
  return new PagesApi(globalConfiguration!);
}

export function getNitroEntities(): EntitiesApi {
  return new EntitiesApi(globalConfiguration!);
}


/**
 * NitroPage component renders all blocks from a Flyo page
 */
export function NitroPage({
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
        <NitroBlock
          key={block.uid || index}
          block={block}
        />
      ))}
    </>
  );
}

export function NitroBlock({
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
    <div style={{ border: '1px solid #fff', padding: '1rem', marginBottom: '1rem', backgroundColor: 'red' }}>
      Component <b>{block.component}</b> not found.
    </div>
  );
}
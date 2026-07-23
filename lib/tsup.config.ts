import { defineConfig } from 'tsup';

const shared = {
  format: ['cjs', 'esm'] as const,
  dts: true,
  splitting: false,
  sourcemap: true,
  external: ['react', 'react-dom', 'next'],
};

export default defineConfig([
  {
    ...shared,
    entry: { client: 'src/client.tsx' },
    clean: true,
    // Ensure "use client" appears before "use strict" in CJS output.
    // Without this, esbuild prepends "use strict" first, which prevents
    // Next.js from recognising the file as a client module (especially
    // in webpack + Babel setups).
    banner: { js: '"use client";' },
  },
  {
    ...shared,
    entry: {
      server: 'src/server.tsx',
      proxy: 'src/proxy.ts',
    },
    clean: false,
    // server.tsx renders the client publisher via the package's own /client
    // subpath. Keep that import external so it resolves to dist/client (which
    // carries the "use client" banner) instead of being inlined into the
    // server bundle, where the directive — and the RSC boundary — would be lost.
    external: [...shared.external, '@flyo/nitro-next/client'],
  },
]);

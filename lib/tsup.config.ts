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
  },
]);

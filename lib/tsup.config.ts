import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    client: 'src/client.tsx',
    server: 'src/server.tsx',
    proxy: 'src/proxy.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom', 'next'],
});

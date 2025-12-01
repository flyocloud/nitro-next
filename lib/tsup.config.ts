import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    client: 'src/client.tsx',
    server: 'src/server.tsx',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom', 'next'],
});

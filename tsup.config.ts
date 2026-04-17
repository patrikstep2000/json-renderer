import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/tailwind.ts', 'src/cli.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom'],
});

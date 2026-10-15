import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/themes/paper',
  test: {
    name: '@kometio/theme-paper',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['blocks/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}'],
    reporters: ['default'],
  },
}));

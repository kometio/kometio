import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/libs/adapters/s3-media-storage',
  test: {
    name: '@kometio/s3-media-storage',
    watch: false,
    globals: true,
    environment: 'node',
    passWithNoTests: true,
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/index.ts'],
      // Same 60% floor as @kometio/local-disk-media-storage (its own
      // vitest.config.mts) — the sibling adapter this one mirrors, held to
      // the same bar rather than the 80% used by pure-function libraries
      // like @kometio/shared-types. The `?? 0` metadata fallbacks (mirrored
      // from LocalDisk) keep branch coverage a bit below 100% in both.
      thresholds: {
        statements: 60,
        branches: 60,
        functions: 60,
        lines: 60,
      },
    },
  },
}));

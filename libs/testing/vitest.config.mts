import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/libs/testing',
  test: {
    name: '@kometio/testing',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
      include: ['src/**/*.ts'],
      // Everything this library holds is test support, named
      // `*.test-fixture.ts`, and docs/adr/0009 keeps fixtures out of the
      // denominator: they are the tests, not the thing under test. The
      // in-memory repositories are exercised by every spec that uses them.
      exclude: [
        'src/**/*.spec.ts',
        'src/**/*.test-fixture.ts',
        'src/index.ts',
        'src/records.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
}));

import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';
import { resolve } from 'node:path';

// Loads local dev credentials for the integration spec, which talks to a
// real Postgres (see docs/development.md). CI sets these as job env vars
// instead, so this is a no-op there.
config({ path: resolve(import.meta.dirname, '../../../.env') });

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/libs/adapters/postgres-db',
  test: {
    name: '@kometio/postgres-db',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
      include: ['src/**/*.ts'],
      // schema.ts is declarative Drizzle table/column metadata, not
      // executable logic — its extraConfig callbacks (unique/check/index)
      // are only ever invoked by drizzle-kit during migration generation,
      // never at runtime, so no test can meaningfully call them. Its
      // correctness is verified by the generated migration SQL (committed,
      // reviewed) and by the integration specs hitting the real, migrated
      // schema — not by import-time execution.
      exclude: [
        'src/**/*.spec.ts',
        'src/index.ts',
        'src/testing.ts',
        'src/lib/schema.ts',
      ],
      thresholds: {
        statements: 60,
        branches: 60,
        functions: 60,
        lines: 60,
      },
    },
  },
}));

import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/public-site',
  test: {
    name: '@kometio/public-site',
    watch: false,
    globals: true,
    environment: 'node',
    // Vitest stubs .css imports to an empty string by default (real CSS
    // processing is usually irrelevant to unit tests) — but
    // theme-registry.ts's `import.meta.glob(..., {query: '?raw'})` needs
    // each theme's actual theme.css text to extract :root tokens from
    // (resolve-theme-base-tokens.ts and friends), so that one pattern
    // opts back in. Scoped narrowly, not `css: true` globally, so every
    // other .css import in this app's test suite stays stubbed/fast.
    // Not end-anchored: the id Vitest matches against includes the
    // `?raw` query suffix from theme-registry.ts's glob options.
    // global.css too, for the same reason: resolve-theme-base-tokens.ts
    // reads core's own :root, the defaults a theme leaves in place.
    css: { include: [/theme\.css/, /styles\/global\.css\?raw/] },
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        // @vitest/coverage-v8's rolldown-based remap step can't parse these
        // three — `import type { X }` and a generic type argument on
        // `import.meta.glob<...>()` both trip it up (confirmed: neither a
        // `import { type X }` rewrite nor a vitest/rolldown patch bump
        // fixed it, so this is an upstream parser gap, not a local fix).
        // Their own logic is still fully covered by their own spec files —
        // this only removes them from the coverage %, not from testing.
        'src/lib/resolve-theme-icons.ts',
        // These three can't be *executed* by plain vitest at all, a
        // stricter limitation than the rolldown gap above: each eagerly
        // globs real themes/<name>/blocks/*.astro files (docs/adr/0042),
        // and plain Vite (no Astro integration registered in this vitest
        // config) can't parse .astro syntax — any test file that imports
        // one of these, even transitively, fails at module load with a
        // parse error, not a coverage-remap warning. Confirmed astro/
        // config's getViteConfig() DOES fix the parse error (it wires in
        // Astro's real Vite plugin), but swapping this whole project's
        // config over to it broke 8 other, unrelated spec files (env var
        // loading changed underneath src/pages/api/forms/[id]/submit.spec.ts
        // and others) — too large/risky a change to bundle into this
        // theme work. Verified instead via real `astro build`/`astro dev`
        // (docs/self-hosting.md) rather than a unit test.
        'src/lib/resolve-theme-block-override.ts',
        'src/lib/resolve-theme-layout-override.ts',
        'src/lib/resolve-theme-page-blocks.ts',
        // Transitively imports resolve-theme-page-blocks.ts above (to fold
        // a theme-defined block's own defaultStyle into the response) —
        // same .astro-parse blocker by inheritance, not a problem of its
        // own; its pure token-resolution logic is unit-tested via
        // resolve-theme-block-style-defaults-helpers.spec.ts instead.
        'src/lib/resolve-theme-block-style-defaults.ts',
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

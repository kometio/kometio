import nx from '@nx/eslint-plugin';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist',
      '**/out-tsc',
      '**/vite.config.*.timestamp*',
      '**/vitest.config.*.timestamp*',
      '**/.astro',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          // Every lib in this workspace is generated with --bundler=none on
          // purpose: none of them are published/consumed as pre-built
          // packages, they're TS source consumed directly by whichever
          // app's own bundler builds it (Vite, webpack, tsc, Astro). This
          // rule's premise (a "buildable" lib losing its non-buildable
          // dependency's source at publish time) doesn't apply here, and it
          // only fires inconsistently depending on which bundler an app
          // happens to use — see docs/adr/0008.
          enforceBuildableLibDependency: false,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          // Hexagonal layering (docs/adr — see also piano-progetto-astro-cms.md):
          // domain (pure entities and value objects) <- application (use
          // cases + ports) <- adapter (Drizzle/S3/SMTP/React field
          // descriptors...) <- app (the NestJS api, editor-app,
          // public-site). Each tag may depend only on itself and on those
          // to its left — never the other way round, and never one app on
          // another app (none of the three apps imports the others today,
          // verified).
          //
          // `testing` (@kometio/testing) sits beside the layers rather than in
          // them: builders, in-memory repositories and fake ports that the
          // application, adapter and app specs share. It may only lean on
          // domain and application, since the fakes implement ports; domain
          // projects cannot use it at all, because it depends on them. That
          // only production code never imports it is not something a tag
          // can say — see the no-restricted-imports block below.
          depConstraints: [
            {
              sourceTag: 'domain',
              onlyDependOnLibsWithTags: ['domain'],
            },
            // The wire shapes of the HTTP API (ADR-0096). Nothing tagged
            // `domain` may name them: a domain rule that needed a response
            // DTO would be tied to how one client happens to read it.
            {
              sourceTag: 'contracts',
              onlyDependOnLibsWithTags: ['domain', 'contracts'],
            },
            {
              sourceTag: 'application',
              onlyDependOnLibsWithTags: [
                'domain',
                'contracts',
                'application',
                'testing',
              ],
            },
            {
              sourceTag: 'adapter',
              onlyDependOnLibsWithTags: [
                'domain',
                'application',
                'adapter',
                'testing',
              ],
            },
            {
              sourceTag: 'app',
              onlyDependOnLibsWithTags: [
                'domain',
                'contracts',
                'application',
                'adapter',
                'testing',
              ],
            },
            {
              sourceTag: 'testing',
              onlyDependOnLibsWithTags: ['domain', 'contracts', 'application'],
            },
            // The browser suite (apps/e2e) drives the apps from outside,
            // over HTTP; it borrows the env reader, never an app's or an
            // adapter's code.
            {
              sourceTag: 'e2e',
              onlyDependOnLibsWithTags: ['domain'],
            },
          ],
        },
      ],
    },
  },
  {
    // The test helpers are allowed everywhere a spec lives and nowhere
    // else: a builder or an in-memory repository reaching production code
    // would ship a fake. Module boundaries work per project, so they
    // cannot tell a spec from the code it tests; this can.
    files: ['**/*.ts', '**/*.tsx'],
    ignores: [
      '**/*.spec.ts',
      '**/*.spec.tsx',
      '**/*.test-fixture.ts',
      '**/*.test-fixture.tsx',
      '**/test-setup.ts',
      '**/src/test/**',
      'libs/testing/**',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@kometio/testing', '@kometio/testing/*'],
              message:
                '@kometio/testing is for specs only — see eslint.config.mjs.',
            },
            {
              // The rows integration specs create and delete: shipped
              // through the index, they ended up in the API's bundle.
              group: ['@kometio/postgres-db/testing'],
              message:
                '@kometio/postgres-db/testing is for specs only — see eslint.config.mjs.',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    // Override or add rules here
    rules: {},
  },
];

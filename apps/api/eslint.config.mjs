import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    // Written from the repository root as well as from here: lint-staged
    // runs eslint from the root, where a bare `src/...` would not match.
    files: ['**/src/**/*.ts'],
    ignores: ['**/*.spec.ts', '**/src/test/**', '**/src/env-schema.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message:
            'Read the environment through API_ENV (env-schema.ts): validated once, typed, and refused at startup when wrong (docs/adr/0094).',
        },
      ],
    },
  },
  {
    // A controller reads the request, calls a use case, and shapes the
    // answer. Reaching into a port itself puts a rule of the application
    // where the use cases and their specs cannot see it: the forms
    // controller was found doing it in the 2026-08 security review, and
    // the same again in nine places a month later. What a controller may
    // still ask of a dependency is what is not a rule: the deployment's
    // resolvers, the generation slots, and the address of a stored file.
    files: ['**/src/app/**/*.controller.ts'],
    ignores: ['**/*.spec.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.object.object.type='ThisExpression'][callee.object.object.property.name='deps']:not([callee.object.property.name=/^(tenant|slots|deploymentSiteResolver)$/]):not([callee.object.property.name='mediaStorage'][callee.property.name='getUrl'])",
          message:
            'Call a use case from @kometio/application instead of a port from the controller (docs/adr/0094).',
        },
      ],
    },
  },
  {
    // Postgres is named in one place. A module that reached the database
    // itself was a second copy of what an adapter is for (the health
    // check, the clean-ups, the tenant lookup did), and a suite that fakes
    // a port could not fake it.
    files: ['**/src/**/*.ts'],
    ignores: [
      '**/*.spec.ts',
      '**/src/test/**',
      '**/src/app/adapters/**',
      '**/src/app/database.module.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@kometio/postgres-db',
              message:
                'Reach the database through a port from @kometio/ports, wired in adapters/adapters.module.ts (docs/adr/0094).',
            },
          ],
        },
      ],
    },
  },
];

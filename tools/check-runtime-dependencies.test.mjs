import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { violations } from './check-runtime-dependencies.mjs';

const project = (overrides) => ({
  directory: 'apps/site',
  packageJson: { dependencies: { astro: '^7' }, devDependencies: {} },
  files: {},
  ...overrides,
});

describe('violations', () => {
  it('finds a library the source imports that is only a devDependency', () => {
    const found = violations([
      project({
        packageJson: { devDependencies: { sharp: '^0.34' } },
        files: { 'apps/site/src/image.ts': "import sharp from 'sharp';" },
      }),
    ]);

    assert.deepEqual(found, [
      { file: 'apps/site/src/image.ts', package: 'sharp' },
    ]);
  });

  it('finds a subpath import and a dynamic one', () => {
    const found = violations([
      project({
        packageJson: { devDependencies: { yazl: '^3', '@scope/lib': '^1' } },
        files: {
          'apps/site/src/a.ts': "const z = await import('yazl/zip');",
          'apps/site/src/b.ts': "import { x } from '@scope/lib/sub';",
        },
      }),
    ]);

    assert.deepEqual(found.map((v) => v.package).sort(), [
      '@scope/lib',
      'yazl',
    ]);
  });

  it('is content with a library that is a dependency as well', () => {
    assert.deepEqual(
      violations([
        project({
          packageJson: {
            dependencies: { sharp: '^0.34' },
            devDependencies: { sharp: '^0.34' },
          },
          files: { 'apps/site/src/image.ts': "import sharp from 'sharp';" },
        }),
      ]),
      [],
    );
  });

  it('does not count a test, its setup, a fixture or a script', () => {
    const imports = "import supertest from 'supertest';";
    assert.deepEqual(
      violations([
        project({
          packageJson: { devDependencies: { supertest: '^7' } },
          files: {
            'apps/site/src/a.spec.ts': imports,
            'apps/site/jest.setup.ts': imports,
            'apps/site/src/b.test-fixture.ts': imports,
            'apps/site/scripts/seed.ts': imports,
            'apps/site/vitest.config.mts': imports,
          },
        }),
      ]),
      [],
    );
  });

  it('does not count a workspace library or a types package', () => {
    assert.deepEqual(
      violations([
        project({
          packageJson: {
            devDependencies: {
              '@kometio/testing': 'workspace:*',
              '@types/node': '^26',
            },
          },
          files: {
            'apps/site/src/a.ts':
              "import '@kometio/testing'; import type {} from '@types/node';",
          },
        }),
      ]),
      [],
    );
  });

  it('lets a theme import astro, which the site it is compiled into provides', () => {
    assert.deepEqual(
      violations([
        {
          directory: 'themes/classic',
          packageJson: { devDependencies: { astro: '^7' } },
          files: {
            'themes/classic/blocks/Code.astro': "import { x } from 'astro';",
          },
        },
      ]),
      [],
    );
  });
});

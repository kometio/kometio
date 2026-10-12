import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, it } from 'node:test';
import { violations } from './runtime-dependency-violations.mjs';

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

describe('violations: the ways a library is reached other than `import ... from`', () => {
  const found = (source) =>
    violations([
      project({
        packageJson: { devDependencies: { sharp: '^0.34' } },
        files: { 'apps/site/src/image.ts': source },
      }),
    ]).map((v) => v.package);

  it('finds import.meta.resolve, which is how the public site reaches its icon sets', () => {
    assert.deepEqual(
      found("const u = import.meta.resolve('sharp/package.json');"),
      ['sharp'],
    );
  });

  it('finds require and require.resolve', () => {
    assert.deepEqual(found("const s = require('sharp');"), ['sharp']);
    assert.deepEqual(
      found("const p = require.resolve('sharp/package.json');"),
      ['sharp'],
    );
  });

  it('finds a re-export', () => {
    assert.deepEqual(found("export { default } from 'sharp';"), ['sharp']);
  });
});

describe('violations: what is not counted is only what is known not to ship', () => {
  const imports = "import supertest from 'supertest';";
  const found = (files) =>
    violations([
      project({ packageJson: { devDependencies: { supertest: '^7' } }, files }),
    ]).map((v) => v.file);

  it('counts a scripts directory that is inside the source', () => {
    // `scripts/` at the root of a project is run by hand, and is not in an
    // image's bundle; `src/scripts/` is source, and ships.
    assert.deepEqual(
      found({
        'apps/site/scripts/seed.ts': imports,
        'apps/site/src/scripts/menu.ts': imports,
      }),
      ['apps/site/src/scripts/menu.ts'],
    );
  });

  it('counts a file only because its name mentions a tool or a config', () => {
    assert.deepEqual(
      found({
        'apps/site/src/site.config.ts': imports,
        'apps/site/src/lib/playwright-helpers.ts': imports,
        'apps/site/src/lib/test-ids.ts': imports,
      }).sort(),
      [
        'apps/site/src/lib/playwright-helpers.ts',
        'apps/site/src/lib/test-ids.ts',
        'apps/site/src/site.config.ts',
      ],
    );
  });

  it('does not count a tool configuration at the root of a project', () => {
    assert.deepEqual(
      found({
        'apps/site/vitest.config.mts': imports,
        'apps/site/eslint.config.mjs': imports,
        'apps/site/playwright.first-run.config.ts': imports,
        'apps/site/astro.config.mjs': imports,
      }),
      [],
    );
  });

  it('does not look at the end-to-end project, which is a test suite from end to end', () => {
    assert.deepEqual(
      violations([
        {
          directory: 'apps/e2e',
          packageJson: { devDependencies: { zod: '^4' } },
          files: { 'apps/e2e/src/support/wire.ts': "import { z } from 'zod';" },
        },
      ]),
      [],
    );
  });

  it('does not count a test directory or an end-to-end one', () => {
    assert.deepEqual(
      found({
        'apps/site/src/test/session.test-fixture.ts': imports,
        'apps/site/src/e2e/main.e2e.ts': imports,
        'apps/site/src/test-setup.ts': imports,
      }),
      [],
    );
  });
});

describe('the command', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const command = join(here, 'check-runtime-dependencies.mjs');
  const roots = [];

  /** A git repository in a directory whose name has a space and an accent in it. */
  const repository = (files) => {
    const root = mkdtempSync(join(tmpdir(), 'kometio runtime déps '));
    roots.push(root);
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    execFileSync('git', ['add', '.'], { cwd: root });
    return root;
  };

  const run = (root) =>
    spawnSync('node', [command, root], { encoding: 'utf8' });

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails naming the file, from a directory with a space in its name', () => {
    const root = repository({
      'apps/site/package.json': JSON.stringify({
        devDependencies: { sharp: '^0.34' },
      }),
      'apps/site/src/image.ts': "import sharp from 'sharp';",
    });

    const result = run(root);

    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /apps\/site\/src\/image\.ts imports sharp/);
  });

  it('passes a workspace whose imports are all dependencies', () => {
    const root = repository({
      'apps/site/package.json': JSON.stringify({
        dependencies: { sharp: '^0.34' },
      }),
      'apps/site/src/image.ts': "import sharp from 'sharp';",
    });

    const result = run(root);

    assert.equal(result.status, 0, result.stdout + result.stderr);
  });

  it('fails, rather than pass, when it finds no project to look at', () => {
    const root = repository({ 'README.md': 'nothing here' });

    const result = run(root);

    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /no project/i);
  });
});

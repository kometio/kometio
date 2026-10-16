import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { themeBlockProblems } from './validate-theme-blocks.mts';

/**
 * The fixtures are plain objects, not blocks built with defineBlock(): the
 * checker reads what a block file exports, and a theme in a temporary folder
 * has no node_modules to import the SDK from.
 */
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

interface Files {
  [name: string]: string;
}

function theme(files: Files): string {
  const root = mkdtempSync(join(tmpdir(), 'kometio-theme-blocks-'));
  roots.push(root);
  mkdirSync(join(root, 'blocks'));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(root, 'blocks', name), content);
  }
  return root;
}

function block(overrides: { type?: string; category?: string } = {}): string {
  const { type = 'Board', category = 'content' } = overrides;
  return `
    export default {
      type: '${type}',
      label: 'blocks.board.label',
      category: '${category}',
      defaultProps: { text: '' },
      fields: [
        { kind: 'text', key: 'text', label: 'blocks.board.fields.text.fieldLabel' },
      ],
    };
    export const schema = { parse: (props) => props };
  `;
}

const LOCALES = JSON.stringify({
  en: { label: 'Board', fields: { text: { fieldLabel: 'Text' } } },
  it: { label: 'Lavagna', fields: { text: { fieldLabel: 'Testo' } } },
});

const GOOD = {
  'Board.block.ts': block(),
  'Board.astro': '<p>board</p>',
  'Board.locales.json': LOCALES,
};

describe('themeBlockProblems', () => {
  it('has nothing to say about a theme with no blocks of its own', async () => {
    const root = mkdtempSync(join(tmpdir(), 'kometio-theme-blocks-'));
    roots.push(root);

    assert.deepEqual(await themeBlockProblems(root), []);
  });

  it('has nothing to say about a block that is complete', async () => {
    assert.deepEqual(await themeBlockProblems(theme(GOOD)), []);
  });

  it('refuses a category a theme may not use, the one that took a site down', async () => {
    const problems = await themeBlockProblems(
      theme({
        ...GOOD,
        'Board.block.ts': block({ category: 'localBusiness' }),
      }),
    );

    assert.equal(problems.length, 1);
    assert.match(
      problems[0] ?? '',
      /Board: category "localBusiness" is not one of/,
    );
  });

  it('refuses a type a core block already has', async () => {
    const problems = await themeBlockProblems(
      theme({
        'Hero.block.ts': block({ type: 'Hero' }),
        'Hero.astro': '<p/>',
        'Hero.locales.json': LOCALES,
      }),
    );

    assert.match(
      problems.join('\n'),
      /Hero: type "Hero" collides with a core block/,
    );
  });

  it('refuses a block with no component to draw it', async () => {
    const { 'Board.astro': _removed, ...withoutComponent } = GOOD;

    const problems = await themeBlockProblems(theme(withoutComponent));

    assert.match(
      problems.join('\n'),
      /no matching "Board.astro" render component/,
    );
  });

  it('refuses a block missing a language of its words', async () => {
    const problems = await themeBlockProblems(
      theme({
        ...GOOD,
        'Board.locales.json': JSON.stringify({
          en: { label: 'Board', fields: { text: { fieldLabel: 'Text' } } },
        }),
      }),
    );

    assert.match(problems.join('\n'), /locales.json is missing "it"/);
  });

  it('refuses a block that does not export its schema, which the site would leave out in silence', async () => {
    const problems = await themeBlockProblems(
      theme({
        ...GOOD,
        'Board.block.ts': block().replace(
          'export const schema',
          'const notExported',
        ),
      }),
    );

    assert.match(
      problems.join('\n'),
      /must also export its schema as `schema`/,
    );
  });

  it('says which file does not load, and why', async () => {
    const problems = await themeBlockProblems(
      theme({
        ...GOOD,
        'Board.block.ts': "throw new Error('the default does not fit');",
      }),
    );

    assert.match(
      problems.join('\n'),
      /Board.block.ts could not be loaded: the default does not fit/,
    );
  });

  it('says which words file is not JSON', async () => {
    const problems = await themeBlockProblems(
      theme({ ...GOOD, 'Board.locales.json': '{ not json' }),
    );

    assert.match(problems.join('\n'), /Board.locales.json is not valid JSON/);
  });
});

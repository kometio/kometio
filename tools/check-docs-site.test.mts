import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  findingsFor,
  textOf,
  type CheckContext,
  type DocsBlock,
  type DocsPage,
  type Finding,
} from './check-docs-site.mts';

const context: CheckContext = {
  defaultLocale: 'en',
  locales: ['en', 'it'],
  translatable: {
    Heading: ['text'],
    Text: ['body'],
    Callout: ['message'],
    Code: ['code'],
  },
  labels: {
    en: new Set(['Forms', 'New form', 'Save']),
    it: new Set(['Moduli', 'Nuovo modulo', 'Salva']),
  },
  typography: [
    { name: 'a straight apostrophe (use ’)', pattern: "'", flags: '' },
  ],
  words: {
    it: [{ name: 'step (use passaggio)', pattern: '\\bstep\\b', flags: 'i' }],
    en: [],
  },
};

const filler = (words: number) =>
  Array.from({ length: words }, () => 'word').join(' ') + '.';

let counter = 0;
function block(type: string, props: Record<string, unknown>): DocsBlock {
  counter += 1;
  return { id: `b${counter}`, type, props };
}
const title = (text: string) => block('Heading', { text, level: 'h1' });
const section = (text: string) => block('Heading', { text, level: 'h2' });
const text = (body: string) => block('Text', { body });

/** A page whose Italian says the same as its English, block by block. */
function page(
  blocks: DocsBlock[],
  overrides: Partial<DocsPage> = {},
): DocsPage {
  const fieldValues: Record<string, Record<string, string>> = {};
  for (const item of blocks) {
    for (const key of context.translatable[item.type] ?? []) {
      const original = item.props[key];
      if (typeof original === 'string')
        fieldValues[item.id] = {
          ...fieldValues[item.id],
          [key]: `it ${original}`,
        };
    }
  }
  return {
    path: 'docs/forms',
    hasChildren: false,
    blocks,
    translations: {
      en: { slug: 'forms', status: 'published', fieldValues: {} },
      it: { slug: 'moduli', status: 'published', fieldValues },
    },
    ...overrides,
  };
}

const rules = (findings: Finding[]) => findings.map((finding) => finding.rule);

const GOOD = () => [
  title('Build a form'),
  text(`<p>${filler(70)}</p>`),
  section('1. Create it'),
  text(`<p>${filler(10)}</p>`),
];

describe('findingsFor', () => {
  it('has nothing to say about a page with a title, a section and something to read', () => {
    assert.deepEqual(findingsFor(page(GOOD()), context), []);
  });

  it('says a page has no translation', () => {
    const lonely = page(GOOD());
    delete lonely.translations['it'];

    assert.deepEqual(rules(findingsFor(lonely, context)), [
      'missing-translation',
    ]);
  });

  it('says a block has no text in the other language, which the page would show in English', () => {
    const blocks = GOOD();
    const withGap = page(blocks);
    const gap = blocks[1];
    delete withGap.translations['it']?.fieldValues[gap?.id ?? '']?.['body'];

    const findings = findingsFor(withGap, context);

    const missing = findings.filter((f) => f.rule === 'missing-text');

    assert.equal(missing.length, 1);
    assert.equal(missing[0]?.severity, 'error');
  });

  it('does not ask for a snippet of code in each language', () => {
    const blocks = [...GOOD(), block('Code', { code: 'pnpm install' })];

    assert.deepEqual(findingsFor(page(blocks), context), []);
  });

  it('says a page that does not start with its title', () => {
    const blocks = [text(`<p>${filler(70)}</p>`), title('A title')];

    assert.ok(rules(findingsFor(page(blocks), context)).includes('no-title'));
  });

  it('lets a Hero be the title of a page', () => {
    const blocks = [block('Hero', { title: 'Kometio' }), ...GOOD().slice(1)];

    assert.ok(!rules(findingsFor(page(blocks), context)).includes('no-title'));
  });

  it('says a page that has two titles', () => {
    const blocks = [...GOOD(), title('Another title')];

    assert.ok(
      rules(findingsFor(page(blocks), context)).includes('many-titles'),
    );
  });

  it('says four paragraphs and no section', () => {
    const blocks = [
      title('T'),
      ...Array.from({ length: 4 }, () => text(`<p>${filler(30)}</p>`)),
    ];

    assert.ok(
      rules(findingsFor(page(blocks), context)).includes('no-sections'),
    );
  });

  it('says a paragraph of more than four sentences', () => {
    const long =
      'One two three. Four five six. Seven eight nine. Ten eleven twelve. Thirteen fourteen fifteen.';
    const blocks = [
      title('T'),
      section('S'),
      text(`<p>${long} ${filler(60)}</p>`),
    ];

    const findings = findingsFor(page(blocks), context).filter(
      (f) => f.rule === 'long-paragraph',
    );

    assert.equal(findings.length, 2);
  });

  it('says a sentence that is a list', () => {
    const listed =
      '<p>A form has these types: Text, Email, Phone, Date, Time and File upload.</p>';
    const blocks = [
      title('T'),
      section('S'),
      text(`${listed}<p>${filler(70)}</p>`),
    ];

    assert.ok(
      rules(findingsFor(page(blocks), context)).includes('list-as-sentence'),
    );
  });

  it('says what the typography and the word rules forbid, in the language they are for', () => {
    const blocks = [
      title('T'),
      section('S'),
      text(`<p>It isn't done. ${filler(70)}</p>`),
    ];
    const gap = page(blocks);
    gap.translations['it'] = {
      slug: 'moduli',
      status: 'published',
      fieldValues: {
        [blocks[2]?.id ?? '']: {
          body: `<p>Aggiungi uno step. ${filler(70)}</p>`,
        },
        [blocks[0]?.id ?? '']: { text: 'T' },
        [blocks[1]?.id ?? '']: { text: 'S' },
      },
    };

    const messages = findingsFor(gap, context)
      .filter((f) => f.rule === 'style')
      .map((f) => f.message);

    assert.deepEqual(messages.sort(), [
      'has a straight apostrophe (use ’)',
      'has step (use passaggio)',
    ]);
  });

  it('says the vague words in English', () => {
    const blocks = [
      title('T'),
      section('S'),
      text(`<p>You can simply click Save. ${filler(70)}</p>`),
    ];

    assert.ok(
      rules(findingsFor(page(blocks), context)).includes('vague-english'),
    );
  });

  it('says a bold name that the editor does not use, and lets the ones it uses and the emphasis be', () => {
    const body = `<p>Open <strong>Forms</strong>, press <strong>Cmd/Ctrl + S</strong>, then <strong>Create form</strong>. <strong>Nothing is lost.</strong> ${filler(70)}</p>`;
    const blocks = [title('T'), section('S'), text(body)];

    const findings = findingsFor(page(blocks), context).filter(
      (f) => f.rule === 'ui-label' && f.where.includes('[en]'),
    );

    assert.equal(findings.length, 1);
    assert.match(findings[0]?.message ?? '', /“Create form”/);
  });

  it('says a page that is a signpost, unless it is the parent of the pages it points to', () => {
    const short = [title('Getting started'), text('<p>Start here.</p>')];

    assert.ok(rules(findingsFor(page(short), context)).includes('thin-page'));
    assert.ok(
      !rules(
        findingsFor(
          page([title('Getting started')], { hasChildren: true }),
          context,
        ),
      ).includes('thin-page'),
    );
  });
});

describe('textOf', () => {
  it('reads what a reader reads', () => {
    assert.equal(
      textOf('<p>A &amp; B</p><ul><li>one</li><li>two</li></ul>'),
      'A & B one two',
    );
  });
});

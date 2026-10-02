import { describe, expect, it } from 'vitest';
import type { PageContent } from './content-model';
import {
  collectSectionReferences,
  copySectionBlocks,
  resolveSectionBlocks,
  sectionOverrideKey,
  sectionPropsSchema,
} from './reusable-section';

const SECTION_ID = 'section-1';

function instance(props: Record<string, unknown> = {}): PageContent {
  return [
    {
      id: 'inst-1',
      type: 'Section',
      props: {
        section: { sectionId: SECTION_ID, sectionName: 'Our services' },
        ...props,
      },
    },
  ];
}

const published: PageContent = [
  { id: 'b1', type: 'Heading', props: { text: 'Our services' } },
  {
    id: 'b2',
    type: 'Container',
    props: {},
    children: [{ id: 'b3', type: 'Text', props: { text: 'Body' } }],
  },
];

describe('resolveSectionBlocks', () => {
  it('grafts the section’s published blocks onto the instance', () => {
    const [block] = resolveSectionBlocks(
      instance(),
      new Map([[SECTION_ID, published]]),
    );
    expect(block.children?.map((child) => child.type)).toEqual([
      'Heading',
      'Container',
    ]);
  });

  /*
   * The ids have to change. They key the per-instance style rule
   * (`.kometio-rb-<id>`) and the translation overlay, so the same section
   * placed twice on one page would otherwise put two elements with the
   * same generated class on one document — a style meant for the second
   * copy would land on both.
   */
  it('rewrites the ids so two instances of one section never collide', () => {
    const map = new Map([[SECTION_ID, published]]);
    const first = resolveSectionBlocks(instance(), map)[0];
    const second = resolveSectionBlocks(
      [{ ...instance()[0], id: 'inst-2' }],
      map,
    )[0];

    expect(first.children?.[0]?.id).toBe('inst-1--b1');
    expect(second.children?.[0]?.id).toBe('inst-2--b1');
  });

  it('applies the instance’s own value to an exposed field, at any depth', () => {
    const [block] = resolveSectionBlocks(
      instance({
        [sectionOverrideKey('b1', 'text')]: 'What we do',
        [sectionOverrideKey('b3', 'text')]: 'Nested body',
      }),
      new Map([[SECTION_ID, published]]),
    );
    expect(block.children?.[0]?.props?.['text']).toBe('What we do');
    expect(block.children?.[1]?.children?.[0]?.props?.['text']).toBe(
      'Nested body',
    );
  });

  /*
   * The key is read from a page's stored props, and a block id is any
   * string of letters, digits, `_` and `-` — `__proto__` included. Written
   * into a plain object, that id used to reach Object.prototype and give
   * every object in the process the field, for as long as it ran.
   */
  it('takes an override addressed to a block named __proto__ for what it is: a block id', () => {
    const guarded: PageContent = [
      { id: '__proto__', type: 'Heading', props: { text: 'Own heading' } },
    ];
    const [block] = resolveSectionBlocks(
      instance({
        [sectionOverrideKey('__proto__', 'text')]: 'Set by instance',
      }),
      new Map([[SECTION_ID, guarded]]),
    );
    expect(block.children?.[0]?.props?.['text']).toBe('Set by instance');

    resolveSectionBlocks(
      instance({ [sectionOverrideKey('__proto__', 'polluted')]: 'yes' }),
      new Map([[SECTION_ID, published]]),
    );
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  /*
   * A section that was deleted, or never published, must not take the page
   * with it: one wrong click in the sections list would otherwise be a
   * site outage on every page that used it.
   */
  it('renders an empty instance when the section is missing or unpublished', () => {
    expect(resolveSectionBlocks(instance(), new Map())[0].children).toEqual([]);
  });

  it('leaves every other block alone, including nested ones', () => {
    const content: PageContent = [
      {
        id: 'c1',
        type: 'Container',
        props: {},
        children: instance(),
      },
    ];
    const [container] = resolveSectionBlocks(
      content,
      new Map([[SECTION_ID, published]]),
    );
    expect(container.type).toBe('Container');
    expect(container.children?.[0]?.children).toHaveLength(2);
  });
});

describe('collectSectionReferences', () => {
  it('finds every referenced section across trees, deduped', () => {
    const ids = collectSectionReferences([
      instance(),
      [
        {
          id: 'c1',
          type: 'Container',
          props: {},
          children: instance(),
        },
      ],
    ]);
    expect([...ids]).toEqual([SECTION_ID]);
  });

  it('ignores a Section block that points nowhere', () => {
    expect(
      collectSectionReferences([
        [{ id: 'x', type: 'Section', props: { section: null } }],
      ]).size,
    ).toBe(0);
  });
});

describe('sectionPropsSchema', () => {
  it('accepts an override key', () => {
    expect(
      sectionPropsSchema.safeParse({
        section: { sectionId: 'a', sectionName: 'A' },
        [sectionOverrideKey('b1', 'title')]: 'Hello',
      }).success,
    ).toBe(true);
  });

  /*
   * The exit barrier PR #144 established, applied to keys and not only to
   * values: `catchall` validates what a key POINTS AT and says nothing at
   * all about the key itself.
   */
  it('refuses a key that is not an override', () => {
    expect(
      sectionPropsSchema.safeParse({ section: null, evil: 'x' }).success,
    ).toBe(false);
    expect(
      sectionPropsSchema.safeParse({
        section: null,
        'ovr:b1:title{}body{display:none}': 'x',
      }).success,
    ).toBe(false);
  });
});

describe('copySectionBlocks', () => {
  it('gives every copied block a new id, at any depth', () => {
    let next = 0;
    const copied = copySectionBlocks(published, () => `new-${next++}`);
    expect(copied.map((block) => block.id)).toEqual(['new-0', 'new-1']);
    expect(copied[1]?.children?.[0]?.id).toBe('new-2');
    // The original is untouched — a template hands out copies, it does not
    // give itself away.
    expect(published[0].id).toBe('b1');
  });
});

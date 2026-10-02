import { describe, expect, it } from 'vitest';
import { migrateColumnsLayout } from './migrate-columns-layout';
import type { PageContent } from './content-model';

const columns = (layout: string, columnCount: number): PageContent => [
  {
    type: 'Columns',
    props: { layout },
    children: Array.from({ length: columnCount }, () => ({
      type: 'Column',
      props: {},
    })),
  },
];

describe('migrateColumnsLayout', () => {
  it('turns the asymmetric preset into the widths it used to render', () => {
    // The one preset that could not survive as "no width at all": it was
    // 3fr 7fr, and a row left to its defaults would become 50/50.
    const { content, changed } = migrateColumnsLayout(
      columns('two-asymmetric', 2),
    );

    expect(changed).toBe(true);
    expect(content[0].props).toEqual({});
    expect(content[0].children?.map((child) => child.props)).toEqual([
      { span: 4 },
      { span: 8 },
    ]);
  });

  it('writes the equal presets out too, so a later third column cannot re-divide the row', () => {
    const { content } = migrateColumnsLayout(columns('two-equal', 2));

    expect(content[0].children?.map((child) => child.props)).toEqual([
      { span: 6 },
      { span: 6 },
    ]);
  });

  it('is safe to run twice: the second pass has nothing to match on', () => {
    const first = migrateColumnsLayout(columns('three-equal', 3));
    const second = migrateColumnsLayout(first.content);

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(second.content).toEqual(first.content);
  });

  it('keeps a width somebody already set', () => {
    const content: PageContent = [
      {
        type: 'Columns',
        props: { layout: 'two-equal' },
        children: [
          { type: 'Column', props: { span: 9 } },
          { type: 'Column', props: {} },
        ],
      },
    ];

    const result = migrateColumnsLayout(content);

    expect(result.content[0].children?.map((child) => child.props)).toEqual([
      { span: 9 },
      { span: 6 },
    ]);
  });

  it('leaves extra columns the preset never described alone', () => {
    const { content } = migrateColumnsLayout(columns('two-equal', 3));

    expect(content[0].children?.map((child) => child.props)).toEqual([
      { span: 6 },
      { span: 6 },
      {},
    ]);
  });

  it('reaches a Columns nested inside another container', () => {
    const content: PageContent = [
      {
        type: 'Container',
        props: {},
        children: columns('two-asymmetric', 2),
      },
    ];

    const result = migrateColumnsLayout(content);

    expect(result.changed).toBe(true);
    expect(
      result.content[0].children?.[0].children?.map((child) => child.props),
    ).toEqual([{ span: 4 }, { span: 8 }]);
  });
});

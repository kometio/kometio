import { describe, expect, it } from 'vitest';
import { PageAncestry } from './page-ancestry';

// servizi > consulenza > prezzi
const parents = new Map<string, string | null>([
  ['servizi', null],
  ['consulenza', 'servizi'],
  ['prezzi', 'consulenza'],
]);

describe('PageAncestry', () => {
  it('lists the groups from the root down to the parent, the parent included', async () => {
    const ancestry = PageAncestry.fromParents(parents);

    expect(await ancestry.groupIdsDownTo('consulenza')).toEqual([
      'servizi',
      'consulenza',
    ]);
    expect(await ancestry.groupIdsDownTo(null)).toEqual([]);
  });

  it('answers null for a chain through a group that is not there', async () => {
    const ancestry = PageAncestry.fromParents(new Map([['orfana', 'sparita']]));

    expect(await ancestry.groupIdsDownTo('orfana')).toBeNull();
  });

  it('answers null for a loop, instead of walking it forever', async () => {
    const ancestry = PageAncestry.fromParents(
      new Map([
        ['a', 'b'],
        ['b', 'a'],
      ]),
    );

    expect(await ancestry.groupIdsDownTo('a')).toBeNull();
  });

  it('follows a chain as deep as MAX_DEPTH, and no deeper', async () => {
    const deep = new Map<string, string | null>();
    for (let level = 0; level <= PageAncestry.MAX_DEPTH; level += 1) {
      deep.set(`g${level}`, level === 0 ? null : `g${level - 1}`);
    }
    const ancestry = PageAncestry.fromParents(deep);

    expect(
      await ancestry.groupIdsDownTo(`g${PageAncestry.MAX_DEPTH - 1}`),
    ).toHaveLength(PageAncestry.MAX_DEPTH);
    expect(
      await ancestry.groupIdsDownTo(`g${PageAncestry.MAX_DEPTH}`),
    ).toBeNull();
  });

  it('builds the slugs of an address only when every ancestor has one', async () => {
    const ancestry = PageAncestry.fromParents(parents);
    const italian = new Map([
      ['servizi', 'servizi'],
      ['consulenza', 'consulenza'],
    ]);

    expect(
      await ancestry.slugsDownTo('consulenza', (id) => italian.get(id)),
    ).toEqual(['servizi', 'consulenza']);
    expect(
      await ancestry.slugsDownTo('consulenza', (id) =>
        id === 'servizi' ? undefined : italian.get(id),
      ),
    ).toBeNull();
  });

  it('asks an async source one hop at a time', async () => {
    const asked: string[] = [];
    const ancestry = new PageAncestry(async (id) => {
      asked.push(id);
      return parents.get(id);
    });

    expect(await ancestry.groupIdsDownTo('prezzi')).toEqual([
      'servizi',
      'consulenza',
      'prezzi',
    ]);
    expect(asked).toEqual(['prezzi', 'consulenza', 'servizi']);
  });
});

import { describe, expect, it } from 'vitest';
import { backfillBlockIds } from './backfill-block-ids';
import type { Block } from './content-model';

describe('backfillBlockIds', () => {
  it('assigns an id to a block missing one', () => {
    const blocks: Block[] = [{ type: 'Hero', props: { title: 'Kometio' } }];
    const result = backfillBlockIds(blocks);

    expect(result.changed).toBe(true);
    expect(result.content[0].id).toEqual(expect.any(String));
  });

  it('never touches an id that is already present', () => {
    const blocks: Block[] = [
      { id: 'existing-id', type: 'Hero', props: { title: 'Kometio' } },
    ];
    const result = backfillBlockIds(blocks);

    expect(result.changed).toBe(false);
    expect(result.content[0].id).toBe('existing-id');
    expect(result.content[0]).toBe(blocks[0]);
  });

  it('is idempotent across a second run', () => {
    const blocks: Block[] = [{ type: 'Text', props: { body: 'ciao' } }];
    const first = backfillBlockIds(blocks);
    const second = backfillBlockIds(first.content);

    expect(second.changed).toBe(false);
    expect(second.content[0].id).toBe(first.content[0].id);
  });

  it('backfills nested children recursively', () => {
    const blocks: Block[] = [
      {
        id: 'container-1',
        type: 'Container',
        props: {},
        children: [
          { type: 'Text', props: { body: 'a' } },
          { id: 'text-b', type: 'Text', props: { body: 'b' } },
        ],
      },
    ];
    const result = backfillBlockIds(blocks);

    expect(result.changed).toBe(true);
    const container = result.content[0];
    expect(container.id).toBe('container-1');
    expect(container.children?.[0].id).toEqual(expect.any(String));
    expect(container.children?.[1].id).toBe('text-b');
  });

  it('does not report changed when every block and descendant already has an id', () => {
    const blocks: Block[] = [
      {
        id: 'container-1',
        type: 'Container',
        props: {},
        children: [{ id: 'text-a', type: 'Text', props: { body: 'a' } }],
      },
    ];
    const result = backfillBlockIds(blocks);

    expect(result.changed).toBe(false);
    expect(result.content[0]).toBe(blocks[0]);
  });

  it('assigns distinct ids to sibling blocks', () => {
    const blocks: Block[] = [
      { type: 'Text', props: { body: 'a' } },
      { type: 'Text', props: { body: 'b' } },
    ];
    const result = backfillBlockIds(blocks);

    expect(result.content[0].id).not.toBe(result.content[1].id);
  });
});

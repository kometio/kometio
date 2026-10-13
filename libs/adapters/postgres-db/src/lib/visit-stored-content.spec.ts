import type { PageContent } from '@kometio/shared-types';
import { getTableName, is } from 'drizzle-orm';
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import type { KometioTx } from './client';
import * as schema from './schema';
import {
  visitStoredContent,
  type StoredContentLocation,
} from './visit-stored-content';

/**
 * `tx` stands for the one thing `visitStoredContent` asks of a transaction:
 * `select(fields).from(table).where()` and `update(table).set().where()`. It
 * answers a select with the rows it was given for that table and records what
 * was selected and what was written.
 *
 * The one cast: a Drizzle transaction is a type nobody can build by hand, and
 * this stands in for it where only those two chains are called.
 */
function fakeTransaction(rowsByTable: Record<string, object[]> = {}) {
  const selected: string[] = [];
  const written: { table: string; changes: Record<string, unknown> }[] = [];
  const tx = {
    select: (fields: Record<string, { name: string }>) => ({
      from: (table: PgTable) => ({
        where: async () => {
          const name = getTableName(table);
          for (const [key, column] of Object.entries(fields)) {
            if (key !== 'id') selected.push(`${name}.${column.name}`);
          }
          return rowsByTable[name] ?? [];
        },
      }),
    }),
    update: (table: PgTable) => ({
      set: (changes: Record<string, unknown>) => ({
        where: async () => {
          written.push({ table: getTableName(table), changes });
        },
      }),
    }),
  };
  return { tx: tx as unknown as KometioTx, selected, written };
}

const sample = (): PageContent => [{ id: 'b1', type: 'Text', props: {} }];
const other = (): PageContent => [{ id: 'b2', type: 'Text', props: {} }];

const isTable = (exported: unknown): exported is PgTable =>
  is(exported, PgTable);

/**
 * The columns of the schema that hold a block tree, found by asking each
 * `jsonb` column whether it takes one: a block-shaped array is read, and one
 * whose `type` is a number is refused. Nobody lists them, so a column added
 * tomorrow is among them tomorrow.
 */
function columnsHoldingBlockTrees(): string[] {
  const takes = (
    column: { mapFromDriverValue(value: unknown): unknown },
    value: unknown,
  ): boolean => {
    try {
      column.mapFromDriverValue(value);
      return true;
    } catch {
      return false;
    }
  };
  return Object.values<unknown>(schema)
    .filter(isTable)
    .flatMap((table) => {
      const { name, columns } = getTableConfig(table);
      return columns
        .filter((column) => column.getSQLType() === 'jsonb')
        .filter(
          (column) =>
            takes(column, [{ type: 'Probe', props: {} }]) &&
            !takes(column, [{ type: 1, props: {} }]),
        )
        .map((column) => `${name}.${column.name}`);
    })
    .sort();
}

describe('visitStoredContent', () => {
  // The list this guards drifted once: reusable sections, and the diverged
  // content of a translation's versions, held block trees that no migration
  // reached because nobody had added them here.
  it('visits every column of the schema that holds a block tree, and only those', async () => {
    const { tx, selected } = fakeTransaction();

    await visitStoredContent(tx, 'tenant', (content) => ({
      content,
      changed: false,
    }));

    const holding = columnsHoldingBlockTrees();
    expect(holding).toContain('page_groups.content'); // the probe finds the obvious one
    expect(holding).not.toContain('page_translations.seo_meta'); // and not one that is JSON of another kind
    expect([...selected].sort()).toEqual(holding);
  });

  it('tells the transform which row and column the content is in', async () => {
    const { tx } = fakeTransaction({
      page_groups: [{ id: 'g1', content: sample() }],
      page_translations: [
        { id: 't1', publishedSnapshot: sample(), divergedContent: null },
      ],
      reusable_sections: [
        { id: 's1', content: sample(), publishedContent: sample() },
      ],
    });
    const seen: StoredContentLocation[] = [];

    await visitStoredContent(tx, 'tenant', (content, where) => {
      seen.push(where);
      return { content, changed: false };
    });

    expect(seen).toEqual([
      { table: 'page_groups', id: 'g1', column: 'content' },
      { table: 'page_translations', id: 't1', column: 'published_snapshot' },
      { table: 'reusable_sections', id: 's1', column: 'content' },
      { table: 'reusable_sections', id: 's1', column: 'published_content' },
    ]);
  });

  it('writes a row once, with the columns that changed, and leaves a current one alone', async () => {
    const { tx, written } = fakeTransaction({
      page_translations: [
        // Both columns hold a tree; only the snapshot is to change.
        { id: 't1', publishedSnapshot: sample(), divergedContent: other() },
        { id: 't2', publishedSnapshot: other(), divergedContent: null },
      ],
    });

    const totals = await visitStoredContent(tx, 'tenant', (content, where) =>
      where.id === 't1' && where.column === 'published_snapshot'
        ? { content: other(), changed: true }
        : { content, changed: false },
    );

    expect(written).toEqual([
      { table: 'page_translations', changes: { publishedSnapshot: other() } },
    ]);
    expect(totals).toEqual({ rewritten: 1, untouched: 1 });
  });

  it('does not offer an empty column to the transform', async () => {
    const { tx } = fakeTransaction({
      site_layout_sections: [
        { id: 'h1', content: sample(), publishedContent: null },
      ],
    });
    let calls = 0;

    await visitStoredContent(tx, 'tenant', (content) => {
      calls += 1;
      return { content, changed: false };
    });

    expect(calls).toBe(1);
  });
});

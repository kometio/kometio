import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { TRANSIENT_TABLES } from './archive.mjs';

// What an archive does with each table of the schema (docs/adr/0105). The list of
// the tables whose rows do not travel (`TRANSIENT_TABLES`) is kept by hand, and a
// list kept by hand fails the way that costs most: a table that is added later
// and that holds sessions, links or what visitors wrote is not in it, and its
// rows go into every archive that is made. This test is what makes adding a table
// a decision: it fails until the table is here, as a site's or as a moment's.
const SITE_TABLES = [
  'tenants',
  'users',
  'sites',
  'site_theme_block_styles',
  'site_ai_settings',
  'collections',
  'page_groups',
  'page_translations',
  'page_group_versions',
  'page_translation_versions',
  'site_layout_sections',
  'site_layout_section_versions',
  'reusable_sections',
  'reusable_section_versions',
  'media',
  'forms',
  'taxonomies',
  'terms',
  'term_slugs',
  'page_group_terms',
];

const SCHEMA = resolve(
  import.meta.dirname,
  '../../libs/adapters/postgres-db/src/lib/schema.ts',
);

const tablesOfTheSchema = () =>
  [...readFileSync(SCHEMA, 'utf8').matchAll(/pgTable\(\s*'([a-z0-9_]+)'/g)].map(
    (match) => match[1],
  );

describe('what an archive does with each table', () => {
  it('knows every table of the schema, as a site’s or as a moment’s', () => {
    const known = new Set([...SITE_TABLES, ...TRANSIENT_TABLES]);
    const unclassified = tablesOfTheSchema().filter(
      (table) => !known.has(table),
    );

    assert.deepEqual(
      unclassified,
      [],
      `a table that is new: does an archive carry its rows (a site's: add it to SITE_TABLES in this file) or not (a moment's: sessions, links in flight, what visitors wrote, a job's state: add it to TRANSIENT_TABLES in archive.mjs)?`,
    );
  });

  it('has no table that the schema no longer has', () => {
    const inTheSchema = new Set(tablesOfTheSchema());
    const gone = [...SITE_TABLES, ...TRANSIENT_TABLES].filter(
      (table) => !inTheSchema.has(table),
    );

    assert.deepEqual(gone, []);
  });

  it('keeps a table on one side only', () => {
    const both = SITE_TABLES.filter((table) =>
      TRANSIENT_TABLES.includes(table),
    );

    assert.deepEqual(both, []);
  });

  it('reads the schema as it is: a count that moves means the pattern no longer finds the tables', () => {
    assert.equal(
      tablesOfTheSchema().length,
      SITE_TABLES.length + TRANSIENT_TABLES.length,
    );
  });
});

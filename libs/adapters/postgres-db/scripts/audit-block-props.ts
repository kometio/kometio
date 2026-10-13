/**
 * Holds the props of every stored block to the schema of its type, and says
 * which do not pass (docs/adr/0124). It changes nothing.
 *
 * The question is the one the public site answers one block at a time while it
 * draws a page: a block whose props its schema refuses is skipped, the log
 * says why, and a visitor sees the page without it. This answers it for
 * everything stored, before a visitor does — after an upgrade that made a
 * schema stricter, before an import is trusted, or on a database that was
 * written by hand.
 *
 * It reads the same places the migrations rewrite (`src/lib/visit-stored-content.ts`):
 * drafts and published content, versions and reusable sections. A page's
 * history will have blocks that no longer pass the current schema without
 * anything being wrong; the report is by table and column so that "the
 * published page is broken" and "an old version is old" are not one number.
 *
 * Exit status: 1 when a block does not pass, 0 otherwise. A theme's own blocks
 * are counted by type and not judged: their schemas live in the theme.
 */
import { auditBlockProps } from '@kometio/shared-types';
import {
  describeInvalidBlock,
  describeUnchecked,
} from '../src/lib/block-props-audit-report';
import { createAppDb, withTenant, type KometioDb } from '../src/lib/client';
import { tenants } from '../src/lib/schema';
import { visitStoredContent } from '../src/lib/visit-stored-content';

/** How many of the failing blocks of one column are named; the count is always whole. */
const NAMED_PER_COLUMN = 20;

interface ColumnReport {
  checked: number;
  invalid: string[];
  invalidCount: number;
}

async function main(): Promise<void> {
  const db: KometioDb = createAppDb();
  const allTenants = await db.select({ id: tenants.id }).from(tenants);

  const columns = new Map<string, ColumnReport>();
  const unchecked = new Map<string, number>();

  for (const tenant of allTenants) {
    await withTenant(db, tenant.id, async (tx) => {
      await visitStoredContent(tx, tenant.id, (content, where) => {
        const audit = auditBlockProps(content);
        const key = `${where.table}.${where.column}`;
        const report = columns.get(key) ?? {
          checked: 0,
          invalid: [],
          invalidCount: 0,
        };
        columns.set(key, report);

        report.checked += audit.checked;
        report.invalidCount += audit.invalid.length;
        for (const problem of audit.invalid) {
          if (report.invalid.length >= NAMED_PER_COLUMN) break;
          report.invalid.push(describeInvalidBlock(where, problem));
        }
        for (const [type, count] of audit.unchecked) {
          unchecked.set(type, (unchecked.get(type) ?? 0) + count);
        }
        return { content, changed: false };
      });
    });
  }
  await db.$client.end();

  let invalid = 0;
  for (const [key, report] of [...columns].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    invalid += report.invalidCount;
    console.log(
      `${key}: ${report.checked} blocks checked, ${report.invalidCount} refused`,
    );
    for (const line of report.invalid) console.log(line);
    if (report.invalidCount > report.invalid.length) {
      console.log(
        `  … and ${report.invalidCount - report.invalid.length} more`,
      );
    }
  }
  if (unchecked.size > 0) {
    console.log(
      `Not checked, no schema here (a theme's own blocks are expected): ${describeUnchecked(unchecked)}`,
    );
  }
  console.log(
    `Block props audit complete: ${invalid} blocks do not pass their schema (${allTenants.length} tenants).`,
  );
  if (invalid > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

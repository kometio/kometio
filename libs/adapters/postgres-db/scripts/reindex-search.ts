/**
 * Rebuilds the search index of every page already published.
 *
 * The index is written once, when a page is published: the words of a
 * page online since last month are the words the extractor knew how to
 * find that day. So a change to `extractSearchableText` — the 2026-09-23
 * pass that taught it eleven more block types, say — reaches only the
 * pages published after it, and a visitor searching for a partner's name
 * on a logo strip still finds nothing on the pages that already show one.
 *
 * This walks what is online and writes the index again, with the
 * extractor as it stands now. It does not publish anything: drafts,
 * `publishedAt` and the snapshots themselves are left exactly as they
 * are, and only `search_text` changes.
 *
 * Sections are expanded first, the same way publishing expands them
 * (docs/adr/0059): a snapshot stores a REFERENCE where a section's words
 * are, so indexing it as it stands would leave every shared section's
 * text unsearchable. The expansion itself is the same pure function the
 * publish path uses, not a second copy of the rule.
 *
 * Safe to re-run, and it writes only where the text actually changed.
 */
import {
  collectSectionReferences,
  extractSearchableText,
  resolveSectionBlocks,
  type PageContent,
} from '@kometio/shared-types';
import { eq, inArray, isNotNull, and } from 'drizzle-orm';
import {
  createAppDb,
  withTenant,
  type KometioDb,
  type KometioTx,
} from '../src/lib/client';
import { pageTranslations, reusableSections, tenants } from '../src/lib/schema';

let rewritten = 0;
let unchanged = 0;

/**
 * The published blocks of every section the given pages point at, in one
 * read — a section used by eight pages is fetched once.
 */
async function publishedSectionsFor(
  tx: KometioTx,
  tenantId: string,
  contents: PageContent[],
): Promise<Map<string, PageContent>> {
  const ids = [...collectSectionReferences(contents)];
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await tx
    .select({
      id: reusableSections.id,
      publishedContent: reusableSections.publishedContent,
    })
    .from(reusableSections)
    .where(
      and(
        eq(reusableSections.tenantId, tenantId),
        inArray(reusableSections.id, ids),
      ),
    );
  return new Map(
    rows
      .filter(
        (
          row,
        ): row is (typeof rows)[number] & { publishedContent: PageContent } =>
          row.publishedContent !== null,
      )
      .map((row) => [row.id, row.publishedContent]),
  );
}

async function reindexTenant(tx: KometioTx, tenantId: string): Promise<void> {
  const rows = await tx
    .select({
      id: pageTranslations.id,
      seoMeta: pageTranslations.seoMeta,
      publishedSnapshot: pageTranslations.publishedSnapshot,
      searchText: pageTranslations.searchText,
    })
    .from(pageTranslations)
    .where(
      and(
        eq(pageTranslations.tenantId, tenantId),
        // Never published, never indexed: a draft matches no search, and
        // giving it words here would put it in results while it is still
        // nobody's business.
        isNotNull(pageTranslations.publishedSnapshot),
      ),
    );

  // The SQL already dropped the drafts; this is the same filter written
  // where the compiler can read it, so the snapshot below is a tree and
  // not `tree | null`.
  const published = rows.filter(
    (row): row is (typeof rows)[number] & { publishedSnapshot: PageContent } =>
      row.publishedSnapshot !== null,
  );
  const sections = await publishedSectionsFor(
    tx,
    tenantId,
    published.map((row) => row.publishedSnapshot),
  );

  for (const row of published) {
    const indexable = resolveSectionBlocks(row.publishedSnapshot, sections);
    const searchText = extractSearchableText(row.seoMeta, indexable);
    if (searchText === row.searchText) {
      unchanged += 1;
      continue;
    }
    await tx
      .update(pageTranslations)
      .set({ searchText })
      .where(eq(pageTranslations.id, row.id));
    rewritten += 1;
  }
}

async function main(): Promise<void> {
  const db: KometioDb = createAppDb();
  const allTenants = await db.select({ id: tenants.id }).from(tenants);

  for (const tenant of allTenants) {
    await withTenant(db, tenant.id, (tx) => reindexTenant(tx, tenant.id));
  }

  console.log(
    `Search index rebuilt: ${rewritten} page(s) rewritten, ${unchanged} already up to date.`,
  );
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

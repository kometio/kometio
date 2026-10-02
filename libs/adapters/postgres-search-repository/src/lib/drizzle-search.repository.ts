import { eq, sql } from 'drizzle-orm';
import type { PageTranslation } from '@kometio/domain-core';
import type { PageSearchResult, SearchPort } from '@kometio/ports';
import { extractSearchableText, type PageContent } from '@kometio/shared-types';
import {
  type KometioDb,
  pageTranslations,
  withTenant,
} from '@kometio/postgres-db';

/**
 * Postgres-specific SearchPort implementation: `search_text` is a plain
 * column indexPage() writes to, `search_vector` (tsvector) is a generated
 * column Postgres derives from it automatically (defined by hand in
 * drizzle/0000_baseline_schema.sql, since Drizzle cannot model one) — this
 * class never reads or writes search_vector directly, only
 * search_text and (read-only) search_vector's own GIN index via raw SQL in
 * search().
 */
export class DrizzleSearchRepository implements SearchPort {
  constructor(private readonly db: KometioDb) {}

  async indexPage(
    tenantId: string,
    siteId: string,
    translation: PageTranslation,
    content: PageContent,
  ): Promise<void> {
    const searchText = extractSearchableText(translation.seoMeta, content);
    await withTenant(this.db, tenantId, (tx) =>
      tx
        .update(pageTranslations)
        .set({ searchText })
        .where(eq(pageTranslations.id, translation.id)),
    );
  }

  async search(
    tenantId: string,
    siteId: string,
    locale: string,
    query: string,
  ): Promise<PageSearchResult[]> {
    // ts_headline builds the highlighted excerpt itself (finds the
    // relevant portion of search_text around the match) — cheaper and
    // simpler than fetching full page content and excerpting it in
    // application code for every result. StartSel/StopSel are plain
    // control characters, not real HTML tags: search_text is extracted
    // from editor-authored prose (Hero titles, Text bodies, ...), so
    // wrapping matches in literal `<mark>` here would mean the excerpt
    // could contain arbitrary editor-typed text sitting right next to a
    // real HTML tag — safe only as long as nothing ever renders this
    // string with dangerouslySetInnerHTML/set:html. Using inert markers
    // instead means callers always get plain text with match boundaries
    // encoded some other way (see `excerptParts` on PageSearchResult, or
    // the marker chars below if you're consuming this table directly).
    const rows = await withTenant(this.db, tenantId, (tx) =>
      tx.execute<{
        id: string;
        slug: string;
        title: string;
        excerpt: string;
      }>(sql`
        select
          id,
          slug,
          seo_meta->>'title' as title,
          ts_headline(
            'italian',
            coalesce(search_text, ''),
            plainto_tsquery('italian', ${query}),
            E'StartSel=\\x01, StopSel=\\x02, MaxFragments=1, MaxWords=30, MinWords=15'
          ) as excerpt
        from page_translations
        where site_id = ${siteId}
          and locale = ${locale}
          and status = 'published'
          and search_vector @@ plainto_tsquery('italian', ${query})
        order by ts_rank(search_vector, plainto_tsquery('italian', ${query})) desc
        limit 20
      `),
    );

    return Array.from(rows).map((row) => ({
      pageId: row.id,
      slug: row.slug,
      title: row.title,
      excerpt: row.excerpt,
    }));
  }
}

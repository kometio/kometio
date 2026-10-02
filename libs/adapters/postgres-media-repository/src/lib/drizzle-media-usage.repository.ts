import { and, eq, or, sql, type AnyColumn } from 'drizzle-orm';
import type { MediaUsagePort, MediaUsageRows } from '@kometio/ports';
import {
  type KometioDb,
  pageGroups,
  pageTranslations,
  reusableSections,
  siteLayoutSections,
  withTenant,
} from '@kometio/postgres-db';

/** What a picked file looks like in a block's props (`pickedMediaSchema`): its id is stored beside the URL. */
const MEDIA_ID_KEY = 'mediaId';

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/**
 * Whether a JSON column mentions this file. The id is a uuid, checked
 * before it gets here, so it is part of the pattern as it is; `\s*` after
 * the colon because jsonb prints `"mediaId": "…"` and json keeps whatever
 * was written.
 */
function mentions(column: AnyColumn, mediaId: string) {
  return sql`${column}::text ~ ${`"${MEDIA_ID_KEY}"\\s*:\\s*"${mediaId}"`}`;
}

/**
 * Connects as `kometio_app`. Reads only.
 *
 * A page counts through every language when the shared content holds the
 * file, though a language unlinked from it keeps a structure of its own —
 * the same over-count on the safe side that asking the database in one
 * query makes: a warning about a page that would not have broken is
 * cheaper than silence about one that would.
 */
export class DrizzleMediaUsageRepository implements MediaUsagePort {
  constructor(private readonly db: KometioDb) {}

  async findUsages(
    tenantId: string,
    siteId: string,
    mediaId: string,
  ): Promise<MediaUsageRows> {
    // A malformed id cannot be anybody's file, and is not put into a pattern.
    if (!UUID.test(mediaId)) return { pages: [], sections: [], layout: [] };

    const [pages, sections, layout] = await withTenant(
      this.db,
      tenantId,
      (tx) =>
        Promise.all([
          tx
            .select({
              pageGroupId: pageTranslations.pageGroupId,
              locale: pageTranslations.locale,
              slug: pageTranslations.slug,
              title: sql<string | null>`${pageTranslations.seoMeta}->>'title'`,
            })
            .from(pageTranslations)
            .innerJoin(
              pageGroups,
              eq(pageGroups.id, pageTranslations.pageGroupId),
            )
            .where(
              and(
                eq(pageTranslations.tenantId, tenantId),
                eq(pageGroups.siteId, siteId),
                or(
                  mentions(pageGroups.content, mediaId),
                  mentions(pageTranslations.publishedSnapshot, mediaId),
                  mentions(pageTranslations.divergedContent, mediaId),
                  mentions(pageTranslations.fieldValues, mediaId),
                ),
              ),
            ),
          tx
            .select({
              sectionId: reusableSections.id,
              name: reusableSections.name,
              kind: reusableSections.kind,
            })
            .from(reusableSections)
            .where(
              and(
                eq(reusableSections.tenantId, tenantId),
                eq(reusableSections.siteId, siteId),
                or(
                  mentions(reusableSections.content, mediaId),
                  mentions(reusableSections.publishedContent, mediaId),
                ),
              ),
            ),
          tx
            .select({
              kind: siteLayoutSections.kind,
              locale: siteLayoutSections.locale,
            })
            .from(siteLayoutSections)
            .where(
              and(
                eq(siteLayoutSections.tenantId, tenantId),
                eq(siteLayoutSections.siteId, siteId),
                or(
                  mentions(siteLayoutSections.content, mediaId),
                  mentions(siteLayoutSections.publishedContent, mediaId),
                ),
              ),
            ),
        ]),
    );

    return { pages, sections, layout };
  }
}

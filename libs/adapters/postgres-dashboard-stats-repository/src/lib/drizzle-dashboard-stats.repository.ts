import { and, count, desc, eq, gte, sql } from 'drizzle-orm';
import { hasUnpublishedChanges } from '@kometio/domain-core';
import type { DashboardStats, DashboardStatsPort } from '@kometio/ports';
import {
  type KometioDb,
  formSubmissions,
  forms,
  media,
  pageGroups,
  pageTranslations,
  withTenant,
} from '@kometio/postgres-db';

export class DrizzleDashboardStatsRepository implements DashboardStatsPort {
  constructor(private readonly db: KometioDb) {}

  async getStats(
    tenantId: string,
    siteId: string,
    recentActivityLimit: number,
  ): Promise<DashboardStats> {
    // Seven days: long enough that a quiet week still shows something,
    // short enough that the number means "recently" rather than "ever".
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [statusCounts, mediaTotals, recentRows, formTotals, recentForms] =
      await withTenant(this.db, tenantId, (tx) =>
        Promise.all([
          tx
            .select({ status: pageTranslations.status, total: count() })
            .from(pageTranslations)
            .where(
              and(
                eq(pageTranslations.tenantId, tenantId),
                eq(pageTranslations.siteId, siteId),
              ),
            )
            .groupBy(pageTranslations.status),
          tx
            .select({
              count: count(),
              // count()/sum() come back as bigint-safe strings from the
              // driver — coalesce to '0' so an empty site sums to 0, not
              // null, then Number() below (safe: total upload size for a
              // single self-hosted site is nowhere near
              // Number.MAX_SAFE_INTEGER bytes).
              totalSizeBytes: sql<string>`coalesce(sum(${media.size}), 0)`,
            })
            .from(media)
            .where(and(eq(media.tenantId, tenantId), eq(media.siteId, siteId))),
          tx
            .select({
              pageGroupId: pageTranslations.pageGroupId,
              pageTranslationId: pageTranslations.id,
              locale: pageTranslations.locale,
              title: sql<string>`${pageTranslations.seoMeta}->>'title'`,
              slug: pageTranslations.slug,
              status: pageTranslations.status,
              updatedAt: pageTranslations.updatedAt,
              // What `hasUnpublishedChanges` reads, dropped once it has.
              isDiverged: pageTranslations.isDiverged,
              contentUpdatedAt: pageTranslations.contentUpdatedAt,
              publishedAt: pageTranslations.publishedAt,
              groupContentUpdatedAt: pageGroups.contentUpdatedAt,
            })
            .from(pageTranslations)
            .innerJoin(
              pageGroups,
              eq(pageTranslations.pageGroupId, pageGroups.id),
            )
            .where(
              and(
                eq(pageTranslations.tenantId, tenantId),
                eq(pageTranslations.siteId, siteId),
              ),
            )
            .orderBy(desc(pageTranslations.updatedAt))
            .limit(recentActivityLimit),
          tx
            .select({
              total: count(),
              // The comparison is built by drizzle rather than written
              // into the template: interpolating the Date directly sends
              // it as an untyped parameter, and inside a FILTER clause
              // Postgres cannot infer what it is — it fails with
              // "operator does not exist: timestamp with time zone >= text".
              recent: sql<string>`count(*) filter (where ${gte(formSubmissions.createdAt, since)})`,
            })
            .from(formSubmissions)
            .where(
              and(
                eq(formSubmissions.tenantId, tenantId),
                eq(formSubmissions.siteId, siteId),
              ),
            ),
          tx
            .select({
              // The id comes from the joined `forms` row rather than from
              // `formSubmissions.formId`: that column is nullable (a deleted
              // form sets it null, docs/adr/0015), and reading it here would
              // mean narrowing a value the join has already guaranteed.
              formId: forms.id,
              formName: forms.name,
              receivedAt: formSubmissions.createdAt,
            })
            .from(formSubmissions)
            // Inner, not left: a submission whose form was deleted has no
            // name to show and nowhere to link to, so it cannot be a row
            // on this list — it still counts in the totals above, which is
            // where it belongs.
            .innerJoin(forms, eq(formSubmissions.formId, forms.id))
            .where(
              and(
                eq(formSubmissions.tenantId, tenantId),
                eq(formSubmissions.siteId, siteId),
              ),
            )
            .orderBy(desc(formSubmissions.createdAt))
            .limit(recentActivityLimit),
        ]),
      );

    const publishedCount =
      statusCounts.find((row) => row.status === 'published')?.total ?? 0;
    const draftCount =
      statusCounts.find((row) => row.status === 'draft')?.total ?? 0;

    return {
      pages: { publishedCount, draftCount },
      media: {
        count: mediaTotals[0]?.count ?? 0,
        totalSizeBytes: Number(mediaTotals[0]?.totalSizeBytes ?? '0'),
      },
      forms: {
        totalCount: formTotals[0]?.total ?? 0,
        recentCount: Number(formTotals[0]?.recent ?? '0'),
        recent: recentForms,
      },
      recentActivity: recentRows.map(
        ({
          isDiverged,
          contentUpdatedAt,
          publishedAt,
          groupContentUpdatedAt,
          ...row
        }) => ({
          ...row,
          title: row.title ?? '',
          hasUnpublishedChanges: hasUnpublishedChanges({
            status: row.status,
            isDiverged,
            contentUpdatedAt,
            publishedAt,
            groupContentUpdatedAt,
          }),
        }),
      ),
    };
  }
}

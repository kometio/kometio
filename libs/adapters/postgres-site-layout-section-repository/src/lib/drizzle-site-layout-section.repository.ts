import { and, eq } from 'drizzle-orm';
import {
  SiteLayoutSection,
  SiteLayoutSectionNotFoundError,
  type SiteLayoutSectionKind,
  type SiteLayoutSectionProps,
} from '@kometio/domain-core';
import type { SiteLayoutSectionRepositoryPort } from '@kometio/ports';
import {
  DrizzlePaginatedRepository,
  type KometioDb,
  siteLayoutSections,
  withTenant,
} from '@kometio/postgres-db';

function toRow(props: SiteLayoutSectionProps) {
  return {
    id: props.id,
    tenantId: props.tenantId,
    siteId: props.siteId,
    locale: props.locale,
    kind: props.kind,
    status: props.status,
    content: props.content,
    publishedContent: props.publishedContent,
    sticky: props.sticky,
    createdAt: props.createdAt,
    updatedAt: props.updatedAt,
  };
}

function fromRow(
  row: typeof siteLayoutSections.$inferSelect,
): SiteLayoutSection {
  return SiteLayoutSection.fromProps(row);
}

/** Connects as `kometio_app` — see docs/adr/0002-non-superuser-role-for-rls-enforcement.md. */
export class DrizzleSiteLayoutSectionRepository
  extends DrizzlePaginatedRepository<
    typeof siteLayoutSections.$inferSelect,
    SiteLayoutSection
  >
  implements SiteLayoutSectionRepositoryPort
{
  protected readonly table = siteLayoutSections;
  protected readonly idColumn = siteLayoutSections.id;
  protected readonly tenantIdColumn = siteLayoutSections.tenantId;

  constructor(db: KometioDb) {
    super(db);
  }

  protected toRow(section: SiteLayoutSection) {
    return toRow(section.toProps());
  }

  protected notFound(id: string): Error {
    return new SiteLayoutSectionNotFoundError(id);
  }

  protected fromRow(
    row: typeof siteLayoutSections.$inferSelect,
  ): SiteLayoutSection {
    return fromRow(row);
  }

  async findBySiteLocaleKind(
    tenantId: string,
    siteId: string,
    locale: string,
    kind: SiteLayoutSectionKind,
  ): Promise<SiteLayoutSection | null> {
    const rows = await withTenant(this.db, tenantId, (tx) =>
      tx
        .select()
        .from(siteLayoutSections)
        .where(
          and(
            eq(siteLayoutSections.tenantId, tenantId),
            eq(siteLayoutSections.siteId, siteId),
            eq(siteLayoutSections.locale, locale),
            eq(siteLayoutSections.kind, kind),
          ),
        )
        .limit(1),
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }
}

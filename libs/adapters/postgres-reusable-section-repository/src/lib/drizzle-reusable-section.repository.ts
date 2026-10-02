import { and, asc, eq, inArray } from 'drizzle-orm';
import {
  ReusableSection,
  ReusableSectionNameAlreadyExistsError,
  ReusableSectionNotFoundError,
  type ReusableSectionProps,
} from '@kometio/domain-core';
import type { ReusableSectionRepositoryPort } from '@kometio/ports';
import {
  DrizzlePaginatedRepository,
  type KometioDb,
  isUniqueViolation,
  reusableSections,
  withTenant,
} from '@kometio/postgres-db';

// Spelled out rather than derived: `isUniqueViolation` compares exactly,
// and this is the name drizzle-kit gives the table's unique constraint.
const NAME_UNIQUE_CONSTRAINT =
  'reusable_sections_tenant_id_site_id_name_unique';

function toRow(props: ReusableSectionProps) {
  return {
    id: props.id,
    tenantId: props.tenantId,
    siteId: props.siteId,
    name: props.name,
    kind: props.kind,
    status: props.status,
    content: props.content,
    publishedContent: props.publishedContent,
    exposedFields: props.exposedFields,
    createdBy: props.createdBy,
    createdAt: props.createdAt,
    updatedAt: props.updatedAt,
  };
}

function fromRow(row: typeof reusableSections.$inferSelect): ReusableSection {
  return ReusableSection.fromProps(row);
}

/** Connects as `kometio_app` — see docs/adr/0002-non-superuser-role-for-rls-enforcement.md. */
export class DrizzleReusableSectionRepository
  extends DrizzlePaginatedRepository<
    typeof reusableSections.$inferSelect,
    ReusableSection
  >
  implements ReusableSectionRepositoryPort
{
  protected readonly table = reusableSections;
  protected readonly idColumn = reusableSections.id;
  protected readonly tenantIdColumn = reusableSections.tenantId;

  constructor(db: KometioDb) {
    super(db);
  }

  protected toRow(section: ReusableSection) {
    return toRow(section.toProps());
  }

  protected fromRow(
    row: typeof reusableSections.$inferSelect,
  ): ReusableSection {
    return fromRow(row);
  }

  /**
   * The use cases check the name first, but two requests can both pass that
   * check — two "Save as template" clicks with one name, say — and the
   * second then reaches the constraint. It has to come back as the same
   * "that name is taken" the check gives, not as a 500.
   */
  override add(section: ReusableSection): Promise<void> {
    return this.withNameViolation(section, () => super.add(section));
  }

  override save(section: ReusableSection): Promise<void> {
    return this.withNameViolation(section, () => super.save(section));
  }

  protected notFound(id: string): Error {
    return new ReusableSectionNotFoundError(id);
  }

  private async withNameViolation(
    section: ReusableSection,
    write: () => Promise<void>,
  ): Promise<void> {
    try {
      await write();
    } catch (error) {
      if (isUniqueViolation(error, NAME_UNIQUE_CONSTRAINT)) {
        throw new ReusableSectionNameAlreadyExistsError(section.name);
      }
      throw error;
    }
  }

  /**
   * One query for every section a page references, not one per reference:
   * a page can carry several instances and each render would otherwise
   * cost a round trip apiece — the same reason
   * `resolvePageContentReferences` memoises its own lookups.
   */
  async findByIds(tenantId: string, ids: string[]): Promise<ReusableSection[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await withTenant(this.db, tenantId, (tx) =>
      tx
        .select()
        .from(reusableSections)
        .where(
          and(
            eq(reusableSections.tenantId, tenantId),
            inArray(reusableSections.id, ids),
          ),
        ),
    );
    return rows.map(fromRow);
  }

  /** By name, because that is the order the insert menu shows them in. */
  async listBySite(
    tenantId: string,
    siteId: string,
  ): Promise<ReusableSection[]> {
    const rows = await withTenant(this.db, tenantId, (tx) =>
      tx
        .select()
        .from(reusableSections)
        .where(
          and(
            eq(reusableSections.tenantId, tenantId),
            eq(reusableSections.siteId, siteId),
          ),
        )
        .orderBy(asc(reusableSections.name)),
    );
    return rows.map(fromRow);
  }
}

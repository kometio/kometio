import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { FormSubmission, type FormSubmissionProps } from '@kometio/domain-core';
import type {
  FormSubmissionRepositoryPort,
  PaginatedResult,
  Pagination,
} from '@kometio/ports';
import {
  type KometioDb,
  formSubmissions,
  withTenant,
} from '@kometio/postgres-db';

function toEntity(row: typeof formSubmissions.$inferSelect): FormSubmission {
  return FormSubmission.fromProps({
    id: row.id,
    tenantId: row.tenantId,
    siteId: row.siteId,
    pageId: row.pageId,
    formId: row.formId,
    payload: row.payload,
    createdAt: row.createdAt,
  });
}

function toRow(props: FormSubmissionProps) {
  return {
    id: props.id,
    tenantId: props.tenantId,
    siteId: props.siteId,
    pageId: props.pageId,
    formId: props.formId,
    payload: props.payload,
    createdAt: props.createdAt,
  };
}

/** Connects as `kometio_app` — see docs/adr/0002-non-superuser-role-for-rls-enforcement.md. */
export class DrizzleFormSubmissionRepository implements FormSubmissionRepositoryPort {
  constructor(private readonly db: KometioDb) {}

  async save(submission: FormSubmission): Promise<void> {
    const row = toRow(submission.toProps());
    await withTenant(this.db, row.tenantId, (tx) =>
      tx.insert(formSubmissions).values(row),
    );
  }

  async countOlderThan(
    tenantId: string,
    siteId: string,
    days: number,
  ): Promise<number> {
    const [row] = await withTenant(this.db, tenantId, (tx) =>
      tx
        .select({ total: count() })
        .from(formSubmissions)
        .where(
          and(
            eq(formSubmissions.tenantId, tenantId),
            eq(formSubmissions.siteId, siteId),
            // The clean-up's own test, written the same way.
            sql`${formSubmissions.createdAt} < now() - (${String(days)} || ' days')::interval`,
          ),
        ),
    );
    return row?.total ?? 0;
  }

  async deleteOne(
    tenantId: string,
    formId: string,
    submissionId: string,
  ): Promise<FormSubmission | null> {
    const [removed] = await withTenant(this.db, tenantId, (tx) =>
      tx
        .delete(formSubmissions)
        .where(
          and(
            eq(formSubmissions.tenantId, tenantId),
            eq(formSubmissions.formId, formId),
            eq(formSubmissions.id, submissionId),
          ),
        )
        .returning(),
    );
    return removed ? toEntity(removed) : null;
  }

  async listByForm(
    tenantId: string,
    formId: string,
    pagination: Pagination,
  ): Promise<PaginatedResult<FormSubmission>> {
    // Not DrizzlePaginatedRepository: that base is built around a
    // tenant-scoped entity with its own id/save/delete surface, and this
    // one is read-and-append only — inheriting it would mean implementing
    // three abstract hooks nothing calls.
    return withTenant(this.db, tenantId, async (tx) => {
      const where = and(
        eq(formSubmissions.tenantId, tenantId),
        eq(formSubmissions.formId, formId),
      );
      const [rows, [totals]] = await Promise.all([
        tx
          .select()
          .from(formSubmissions)
          .where(where)
          // Newest first: an admin opening this is looking for what just
          // came in, not for the oldest thing on record.
          // The id breaks ties between answers sent in the same instant,
          // which otherwise straddled a page boundary twice or not at all.
          .orderBy(desc(formSubmissions.createdAt), desc(formSubmissions.id))
          .limit(pagination.pageSize)
          .offset((pagination.page - 1) * pagination.pageSize),
        tx.select({ value: count() }).from(formSubmissions).where(where),
      ]);
      return { items: rows.map(toEntity), total: totals?.value ?? 0 };
    });
  }

  async countByForms(
    tenantId: string,
    formIds: string[],
  ): Promise<Record<string, number>> {
    // `inArray` with an empty list generates `in ()`, which Postgres
    // rejects as a syntax error — and an empty page has nothing to count
    // anyway.
    if (formIds.length === 0) return {};

    return withTenant(this.db, tenantId, async (tx) => {
      const rows = await tx
        .select({ formId: formSubmissions.formId, total: count() })
        .from(formSubmissions)
        .where(
          and(
            eq(formSubmissions.tenantId, tenantId),
            inArray(formSubmissions.formId, formIds),
          ),
        )
        .groupBy(formSubmissions.formId);

      return Object.fromEntries(
        rows.flatMap((row) => (row.formId ? [[row.formId, row.total]] : [])),
      );
    });
  }

  async listAllByForm(
    tenantId: string,
    formId: string,
  ): Promise<FormSubmission[]> {
    return withTenant(this.db, tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(formSubmissions)
        .where(
          and(
            eq(formSubmissions.tenantId, tenantId),
            eq(formSubmissions.formId, formId),
          ),
        )
        // Oldest first for the export: a spreadsheet reads top-to-bottom as
        // a timeline, which is the opposite of what the screen wants.
        .orderBy(formSubmissions.createdAt);
      return rows.map(toEntity);
    });
  }

  /**
   * A file answer is the one kind of value that is an object, `{ url,
   * filename }`: every such url in every payload, read in the database
   * rather than by loading every submission.
   */
  async listAttachmentUrls(tenantId: string): Promise<Set<string>> {
    const rows = await withTenant(this.db, tenantId, (tx) =>
      tx.execute<{ url: string }>(sql`
        select distinct answer.value ->> 'url' as url
          from ${formSubmissions},
               jsonb_each(${formSubmissions.payload}) as answer
         where ${formSubmissions.tenantId} = ${tenantId}
           and jsonb_typeof(answer.value) = 'object'
           and answer.value ? 'url'`),
    );
    return new Set(Array.from(rows, (row) => row.url));
  }
}

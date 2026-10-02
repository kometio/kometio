import type { FormSubmission } from '@kometio/domain-core';
import type { Pagination, PaginatedResult } from './pagination';

export interface FormSubmissionRepositoryPort {
  save(submission: FormSubmission): Promise<void>;

  /**
   * One form's submissions, newest first. Paginated for the admin list.
   *
   * Scoped to a form rather than to a site: submissions are only ever read
   * in the context of the form that produced them, because a payload is
   * keyed by field id and means nothing without that form's field
   * definitions to read it against.
   */
  listByForm(
    tenantId: string,
    formId: string,
    pagination: Pagination,
  ): Promise<PaginatedResult<FormSubmission>>;

  /**
   * How many submissions each of these forms has, keyed by form id. A form
   * with none is absent from the map rather than present as zero — the
   * caller is merging into a list it already has, and an absent key reads
   * the same as a zero there.
   *
   * Takes several ids at once because the forms list needs the count for
   * a whole page of forms, and asking per form would be one query per row.
   */
  countByForms(
    tenantId: string,
    formIds: string[],
  ): Promise<Record<string, number>>;

  /**
   * Every submission for a form, unpaginated — the export.
   *
   * Deliberately separate from `listByForm` rather than "the same call
   * with a huge pageSize": a caller that wants a page and a caller that
   * wants a file are asking different questions, and one of them must not
   * be reachable by accident from the admin list's own pagination
   * controls.
   */
  listAllByForm(tenantId: string, formId: string): Promise<FormSubmission[]>;

  /**
   * How many of a site's submissions are older than this many days — what a
   * retention of that length would delete at its next clean-up. Asked
   * before the retention is saved, so the question can say a number. The
   * same age test the clean-up itself applies (see
   * `deleteExpiredFormSubmissions`), so the two cannot disagree.
   */
  countOlderThan(
    tenantId: string,
    siteId: string,
    days: number,
  ): Promise<number>;

  /**
   * Deletes one submission of one form, for good — a person's request to
   * be forgotten, answered for a single answer. Answers the submission
   * that went, for the files it named to be removed with it: `null` for
   * one that is not there, is another form's, or another tenant's, so a
   * wrong id cannot delete a right one.
   */
  deleteOne(
    tenantId: string,
    formId: string,
    submissionId: string,
  ): Promise<FormSubmission | null>;

  /**
   * The url of every file any submission of this tenant still names: what
   * the attachment sweep must keep.
   */
  listAttachmentUrls(tenantId: string): Promise<Set<string>>;
}

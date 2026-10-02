import { FormNotFoundError } from '@kometio/domain-core';
import type { Form, FormSubmission } from '@kometio/domain-core';
import type {
  FormRepositoryPort,
  FormSubmissionRepositoryPort,
  PageTranslationRepositoryPort,
  PaginatedResult,
} from '@kometio/ports';

export interface ListFormSubmissionsDeps {
  formRepository: FormRepositoryPort;
  formSubmissionRepository: FormSubmissionRepositoryPort;
  /** Only to name the pages the submissions came from — see `resolveOriginPages`. */
  pageTranslationRepository: PageTranslationRepositoryPort;
}

/**
 * How many answers each form has had, for a page of forms at once: the
 * forms list shows it on every row, and the form editor on its
 * Submissions tab.
 */
export function countFormSubmissions(
  deps: Pick<ListFormSubmissionsDeps, 'formSubmissionRepository'>,
  input: { tenantId: string; formIds: string[] },
): Promise<Record<string, number>> {
  return deps.formSubmissionRepository.countByForms(
    input.tenantId,
    input.formIds,
  );
}

/**
 * One page a batch of submissions came from, named well enough to show
 * and to open.
 *
 * Returned alongside the submissions rather than embedded in each one for
 * the same reason `form` is: a page is shared by many submissions, and
 * repeating its title on every row would be the same string over and
 * over on the wire.
 */
export interface SubmissionOriginPage {
  /** The page translation's id — what `FormSubmission.pageId` holds. */
  id: string;
  /** What the editor opens: a page is edited by group, in a language. */
  pageGroupId: string;
  locale: string;
  /** `seoMeta.title`, or the slug when a page has never been given one. */
  title: string;
}

export interface ListFormSubmissionsInput {
  tenantId: string;
  formId: string;
  page: number;
  pageSize: number;
}

export interface ListFormSubmissionsResult extends PaginatedResult<FormSubmission> {
  /**
   * The form as it stands *now*, returned alongside its submissions
   * because a payload is keyed by field id and is unreadable without it.
   *
   * "As it stands now" is the honest caveat: fields get renamed and
   * removed, so a submission can carry keys this form no longer has. That
   * is not a defect to hide — it is a real thing that happened, and the
   * caller is expected to show those values rather than drop them.
   */
  form: Form;
  /**
   * The pages these submissions were filled on, each named once.
   *
   * Not every submission has one: those recorded before the public site
   * knew which page it was rendering carry no origin at all, and so does
   * one whose page has since been deleted.
   */
  pages: SubmissionOriginPage[];
}

/**
 * The read side of the form builder. It existed only as a write path until
 * now: submissions were stored and emailed, and there was no way to look
 * at them again afterwards.
 *
 * Loads the form first, so a request for a form that is not this tenant's
 * fails as "not found" before any submission is read — the submissions
 * table is scoped by tenant too, but the form is the thing being asked
 * about, and it should be the thing that decides.
 */
export async function listFormSubmissions(
  deps: ListFormSubmissionsDeps,
  input: ListFormSubmissionsInput,
): Promise<ListFormSubmissionsResult> {
  const form = await deps.formRepository.findById(input.tenantId, input.formId);
  if (!form) {
    throw new FormNotFoundError(input.formId);
  }

  const { items, total } = await deps.formSubmissionRepository.listByForm(
    input.tenantId,
    input.formId,
    { page: input.page, pageSize: input.pageSize },
  );

  return {
    items,
    total,
    form,
    pages: await resolveOriginPages(deps, input.tenantId, items),
  };
}

/**
 * The distinct pages a set of submissions came from.
 *
 * Distinct, and that is the whole point: a contact form lives on one page
 * and a newsletter box lives in the footer of all of them, so the number
 * of pages behind a batch of submissions is small however large the batch
 * is. One read per page, not one per submission.
 *
 * A page that no longer exists is left out rather than reported as an
 * error: the column is `on delete set null`, so this only happens for a
 * row being deleted as this runs, and the submission itself still reads
 * fine without it.
 */
async function resolveOriginPages(
  deps: ListFormSubmissionsDeps,
  tenantId: string,
  submissions: FormSubmission[],
): Promise<SubmissionOriginPage[]> {
  const ids = [
    ...new Set(
      submissions
        .map((submission) => submission.pageId)
        .filter((pageId): pageId is string => pageId !== null),
    ),
  ];
  const translations = await Promise.all(
    ids.map((id) => deps.pageTranslationRepository.findById(tenantId, id)),
  );
  return translations
    .filter((translation) => translation !== null)
    .map((translation) => ({
      id: translation.id,
      pageGroupId: translation.pageGroupId,
      locale: translation.locale,
      title: translation.seoMeta.title || translation.slug,
    }));
}

export interface ExportFormSubmissionsResult {
  form: Form;
  submissions: FormSubmission[];
  pages: SubmissionOriginPage[];
}

/** Every submission for one form, for the CSV export. Same ownership check. */
export async function exportFormSubmissions(
  deps: ListFormSubmissionsDeps,
  input: { tenantId: string; formId: string },
): Promise<ExportFormSubmissionsResult> {
  const form = await deps.formRepository.findById(input.tenantId, input.formId);
  if (!form) {
    throw new FormNotFoundError(input.formId);
  }

  const submissions = await deps.formSubmissionRepository.listAllByForm(
    input.tenantId,
    input.formId,
  );

  return {
    form,
    submissions,
    pages: await resolveOriginPages(deps, input.tenantId, submissions),
  };
}

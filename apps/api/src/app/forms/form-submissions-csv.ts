import type { SubmissionOriginPage } from '@kometio/application';
import type { Form, FormSubmission } from '@kometio/domain-core';

/**
 * Excel and Numbers both read a bare `=`, `+`, `-` or `@` at the start of a
 * cell as the beginning of a formula. A submitted value like
 * `=HYPERLINK("http://evil","click")` is therefore code that runs when the
 * admin opens the export — a CSV injection, and the payload here is
 * attacker-controlled by definition: anyone on the internet can fill in the
 * form.
 *
 * Prefixing with a single quote is the standard defence: spreadsheets treat
 * the cell as text, and the quote itself is not shown.
 */
function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** RFC 4180: quote everything containing a comma, a quote or a newline, and double any quote inside. */
function escapeCell(value: string): string {
  const safe = neutralizeFormula(value);
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  // A file field's value is `{ url, filename }` — String() on it would put
  // "[object Object]" in the cell (the same trap submit-form.use-case.ts's
  // notification email hit). The URL is the useful half: it is what makes
  // the attachment retrievable from a spreadsheet.
  if (typeof value === 'object') {
    const file = value as { filename?: unknown; url?: unknown };
    if (typeof file.url === 'string') {
      return typeof file.filename === 'string'
        ? `${file.filename} (${file.url})`
        : file.url;
    }
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * One CSV for one form's submissions.
 *
 * Columns come from the form's *current* fields, plus any key found in the
 * data that the form no longer has — appended at the end and labelled by
 * its raw id. Dropping those would silently lose real answers, which is
 * the failure mode that matters here: the export is what someone reaches
 * for precisely when they need everything.
 *
 * Two columns before them: when it arrived, and which page it was filled
 * on. The page is second rather than last because the spreadsheet is
 * where "which page converts" is actually counted, and a column nobody
 * scrolls to is a column nobody groups by.
 */
export function buildFormSubmissionsCsv(
  form: Form,
  submissions: FormSubmission[],
  pages: SubmissionOriginPage[],
): string {
  const pagesById = new Map(pages.map((page) => [page.id, page]));
  const fields = form.toProps().fields;
  const knownIds = fields.map((field) => field.id);
  const orphanIds = [
    ...new Set(
      submissions.flatMap((submission) =>
        Object.keys(submission.toProps().payload).filter(
          (key) => !knownIds.includes(key),
        ),
      ),
    ),
  ].sort();

  const header = [
    'Submitted at',
    'Page',
    ...fields.map((field) => field.label),
    ...orphanIds.map((id) => `${id} (removed field)`),
  ];

  const rows = submissions.map((submission) => {
    const { payload, createdAt } = submission.toProps();
    const page = submission.pageId
      ? pagesById.get(submission.pageId)
      : undefined;
    return [
      createdAt.toISOString(),
      // Empty for a submission recorded before the site knew which page
      // it was rendering, and for one whose page has since been deleted.
      page ? `${page.title} (${page.locale})` : '',
      ...knownIds.map((id) => renderValue(payload[id])),
      ...orphanIds.map((id) => renderValue(payload[id])),
    ];
  });

  return [header, ...rows]
    .map((row) => row.map(escapeCell).join(','))
    .join('\r\n');
}

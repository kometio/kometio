import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { RedirectImportReport } from '../../lib/redirects-api-client';
import { describeRedirectProblem } from './redirect-problems';

export interface ImportProblemsProps {
  report: RedirectImportReport;
}

/**
 * The lines of an import that cannot be used, each with the number it had in
 * the file (or in the list) and its reason in words: what a person needs to
 * fix them, and nothing of the lines that went through.
 */
export function ImportProblems({ report }: ImportProblemsProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const problems = report.rows.filter((row) => row.outcome === 'error');
  if (problems.length === 0) return null;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h3 id={headingId} className="text-sm font-semibold">
        {t('redirects.import.problemsTitle')}
      </h3>
      <p className="text-xs text-muted-foreground">
        {t('redirects.import.problemsHint')}
      </p>
      <ul className="max-h-56 divide-y overflow-y-auto rounded-md border">
        {problems.map((row) => (
          <li
            key={row.line}
            className="flex flex-col gap-0.5 px-3 py-2 text-sm"
          >
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {t('redirects.import.line', { line: row.line })}
              </span>
              {row.from !== '' && (
                <span className="truncate font-mono">{row.from}</span>
              )}
            </span>
            <span className="text-xs text-destructive">
              {describeRedirectProblem(t, {
                side: row.side ?? 'file',
                problem: row.problem ?? '',
                ...(row.detail === undefined ? {} : { detail: row.detail }),
              })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "2 new · 1 changed · 3 already in place": what a report says, in the order it matters, with what is none left out. */
export function ReportSummary({ report }: ImportProblemsProps) {
  const { t } = useTranslation();
  const parts = [
    report.created > 0 &&
      t('redirects.import.summary.created', { count: report.created }),
    report.updated > 0 &&
      t('redirects.import.summary.updated', { count: report.updated }),
    report.unchanged > 0 &&
      t('redirects.import.summary.unchanged', { count: report.unchanged }),
    report.failed > 0 &&
      t('redirects.import.summary.failed', { count: report.failed }),
  ].filter((part) => part !== false);
  return (
    <p role="status" className="text-sm font-medium">
      {parts.join(' · ')}
    </p>
  );
}

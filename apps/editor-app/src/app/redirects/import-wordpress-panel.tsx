import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import type { WordPressPermalink } from '@kometio/shared-types';
import { Button } from '../../components/ui/button';
import { DialogFooter } from '../../components/ui/dialog';
import { InlineError } from '../../components/ui/inline-error';
import { Label } from '../../components/ui/label';
import { OptionsSelect } from '../../components/ui/select';
import { SkeletonRows } from '../../components/ui/skeleton';
import { ApiError, actionErrorMessage } from '../../lib/http-client';
import { useFormatDate } from '../../lib/use-format-date';
import type { WordPressRedirectPlan } from '../../lib/redirects-api-client';
import { importJobsQueryOptions } from '../imports/imports-queries';
import { ImportProblems, ReportSummary } from './import-problems';
import { useRedirects } from './use-redirects';

export interface ImportWordPressPanelProps {
  siteId: string;
  onCancel: () => void;
  /** What was made, once it is made. */
  onApplied: (plan: WordPressRedirectPlan) => void;
}

const CSV_FILE_NAME = 'wordpress-pages-without-a-page.csv';

/** What a spreadsheet reads as a formula when it opens a cell that starts with it. */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * A spreadsheet's cell: quoted, with its quotes doubled, so that a title with
 * a comma is one cell — and never a formula. The titles are the export's,
 * which is somebody else's file, and a cell that starts with `=` is run by the
 * program that opens it; a leading apostrophe makes it text.
 */
const cell = (value: string): string =>
  `"${(FORMULA_START.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`;

/** What has no page here, as a file to work from: the type, the title, and where it used to be. */
export function leftOutAsCsv(
  unmatched: readonly WordPressPermalink[],
  ambiguous: readonly WordPressPermalink[],
  labels: { type: string; title: string; address: string; note: string },
  notes: { unmatched: string; ambiguous: string },
): string {
  const rows = [
    [labels.type, labels.title, labels.address, labels.note],
    ...unmatched.map((one) => [one.type, one.title, one.link, notes.unmatched]),
    ...ambiguous.map((one) => [one.type, one.title, one.link, notes.ambiguous]),
  ];
  return `${rows.map((row) => row.map(cell).join(',')).join('\n')}\n`;
}

/**
 * The redirects of a WordPress move, from a file that was read in Import.
 *
 * What the export knows is where each page and post of the old site lived;
 * what the site knows is which pages it has now. The two are put side by
 * side before anything is written: how many pages already have a page here,
 * which have none yet (a list to work from — make the page, ask again, and
 * what is already done stays as it is), and which could be more than one.
 */
export function ImportWordPressPanel({
  siteId,
  onCancel,
  onApplied,
}: ImportWordPressPanelProps) {
  const { t } = useTranslation();
  const formatDate = useFormatDate();
  const { fromWordPress } = useRedirects(siteId);
  const jobs = useQuery(importJobsQueryOptions(siteId));
  const [chosen, setChosen] = useState<string | null>(null);
  const [plan, setPlan] = useState<WordPressRedirectPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const analysed = (jobs.data?.items ?? []).filter(
    (job) => job.status === 'analyzed',
  );
  const jobId = chosen ?? analysed[0]?.id ?? null;

  const csv = useMemo(
    () =>
      plan === null
        ? ''
        : leftOutAsCsv(
            plan.unmatched,
            plan.ambiguous,
            {
              type: t('redirects.import.wordpress.csv.type'),
              title: t('redirects.import.wordpress.csv.title'),
              address: t('redirects.import.wordpress.csv.address'),
              note: t('redirects.import.wordpress.csv.note'),
            },
            {
              unmatched: t('redirects.import.wordpress.csv.unmatched'),
              ambiguous: t('redirects.import.wordpress.csv.ambiguous'),
            },
          ),
    [plan, t],
  );
  async function run(dryRun: boolean) {
    if (jobId === null) return;
    setError('');
    setBusy(true);
    try {
      const result = await fromWordPress({ importJobId: jobId, dryRun });
      if (dryRun) {
        setPlan(result);
      } else {
        onApplied(result);
        onCancel();
      }
    } catch (failure) {
      const code = failure instanceof ApiError ? failure.displayMessage : null;
      if (code?.startsWith('import:no-permalinks')) {
        setError(t('redirects.import.wordpress.noPermalinks'));
      } else if (code?.startsWith('import:not-analyzed')) {
        setError(t('redirects.import.wordpress.notAnalyzed'));
      } else {
        setError(actionErrorMessage(failure, t('redirects.import.failed')));
      }
    } finally {
      setBusy(false);
    }
  }

  if (jobs.isPending) return <SkeletonRows rows={2} />;
  if (jobs.isError) {
    return (
      <InlineError>{t('redirects.import.wordpress.loadFailed')}</InlineError>
    );
  }

  if (analysed.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 rounded-lg border border-dashed p-4">
          <p className="text-sm font-medium">
            {t('redirects.import.wordpress.none.title')}
          </p>
          <p className="text-sm text-muted-foreground">
            {t('redirects.import.wordpress.none.body')}
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button asChild>
            <Link to="/imports">
              {t('redirects.import.wordpress.none.goToImport')}
            </Link>
          </Button>
        </DialogFooter>
      </div>
    );
  }

  if (plan === null) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {t('redirects.import.wordpress.description')}
        </p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="redirects-wordpress-file">
            {t('redirects.import.wordpress.file')}
          </Label>
          <OptionsSelect
            id="redirects-wordpress-file"
            value={jobId ?? ''}
            onValueChange={setChosen}
            options={analysed.map((job) => ({
              value: job.id,
              label: t('redirects.import.wordpress.fileOption', {
                name: job.fileName,
                date: formatDate(job.createdAt) ?? '',
              }),
            }))}
          />
        </div>
        <InlineError>{error}</InlineError>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            disabled={busy || jobId === null}
            onClick={() => void run(true)}
          >
            {busy
              ? t('redirects.import.checking')
              : t('redirects.import.wordpress.check')}
          </Button>
        </DialogFooter>
      </div>
    );
  }

  const total =
    plan.pages.matched + plan.pages.ambiguous + plan.pages.unmatched;
  const toImport = plan.report.created + plan.report.updated;
  const leftOut = plan.pages.unmatched + plan.pages.ambiguous;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        {t('redirects.import.wordpress.found', {
          matched: plan.pages.matched,
          total,
        })}
      </p>
      <ReportSummary report={plan.report} />
      <ImportProblems report={plan.report} />

      {plan.pages.unmatched > 0 && (
        <LeftOut
          title={t('redirects.import.wordpress.unmatched.title', {
            count: plan.pages.unmatched,
          })}
          hint={t('redirects.import.wordpress.unmatched.hint')}
          items={plan.unmatched}
          total={plan.pages.unmatched}
        />
      )}
      {plan.pages.ambiguous > 0 && (
        <LeftOut
          title={t('redirects.import.wordpress.ambiguous.title', {
            count: plan.pages.ambiguous,
          })}
          hint={t('redirects.import.wordpress.ambiguous.hint')}
          items={plan.ambiguous}
          total={plan.pages.ambiguous}
        />
      )}
      {leftOut > 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => download(CSV_FILE_NAME, csv)}
        >
          <Download />
          {t('redirects.import.wordpress.download')}
        </Button>
      )}

      <InlineError>{error}</InlineError>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => {
            setPlan(null);
            setError('');
          }}
        >
          {t('redirects.import.back')}
        </Button>
        <Button
          type="button"
          disabled={busy || toImport === 0}
          onClick={() => void run(false)}
        >
          {toImport === 0
            ? t('redirects.import.nothingToImport')
            : t('redirects.import.apply', { count: toImport })}
        </Button>
      </DialogFooter>
    </div>
  );
}

function LeftOut({
  title,
  hint,
  items,
  total,
}: {
  title: string;
  hint: string;
  items: readonly WordPressPermalink[];
  total: number;
}) {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <ul className="max-h-48 divide-y overflow-y-auto rounded-md border">
        {items.map((item) => (
          <li key={item.id} className="flex flex-col gap-0.5 px-3 py-2 text-sm">
            <span className="truncate">{item.title}</span>
            <span className="truncate font-mono text-xs text-muted-foreground">
              {item.link}
            </span>
          </li>
        ))}
      </ul>
      {items.length < total && (
        <p className="text-xs text-muted-foreground">
          {t('redirects.import.wordpress.shown', {
            shown: items.length,
            total,
          })}
        </p>
      )}
    </section>
  );
}

/**
 * Hands the browser a file that exists only in this tab, as a download. Made
 * when it is asked for and given back at once: a file the server makes is a
 * link to the server (DESIGN.md), and this one has no address to link to.
 */
function download(filename: string, text: string): void {
  // A byte-order mark, so that a spreadsheet reads the accents as what they are.
  const url = URL.createObjectURL(
    new Blob([`\uFEFF${text}`], { type: 'text/csv;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

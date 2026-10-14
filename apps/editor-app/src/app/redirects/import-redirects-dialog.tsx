import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileUp } from 'lucide-react';
import { MAX_REDIRECT_CSV_ROWS } from '@kometio/shared-types';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { InlineError } from '../../components/ui/inline-error';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { actionErrorMessage } from '../../lib/http-client';
import type { RedirectImportReport } from '../../lib/redirects-api-client';
import { describeRedirectProblem } from './redirect-problems';

/** What the API takes in one request (`importRedirectsBodySchema`): some forty thousand lines. */
const MAX_FILE_BYTES = 2_000_000;

export interface ImportRedirectsDialogProps {
  onOpenChange: (open: boolean) => void;
  /** Judges the list and writes nothing. */
  onCheck: (csv: string) => Promise<RedirectImportReport>;
  /** Does what the check said; the report is what was done. */
  onApply: (csv: string) => Promise<RedirectImportReport>;
  onApplied: (report: RedirectImportReport) => void;
}

/**
 * A list of redirects in two steps, so that nothing is written on a hope:
 * the list is read and judged (a dry run, which is the same code as the real
 * one), and what it would do — new, changed, left as it is, and each line
 * that cannot be used with its reason — is shown before "Import" does it.
 *
 * The same list imported again changes nothing (an address with a rule is
 * updated, not doubled), which is said where the format is, so that nobody
 * is afraid of pressing it twice.
 */
export function ImportRedirectsDialog({
  onOpenChange,
  onCheck,
  onApply,
  onApplied,
}: ImportRedirectsDialogProps) {
  const { t } = useTranslation();
  const ids = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState('');
  const [report, setReport] = useState<RedirectImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function readFile(file: File) {
    setError('');
    if (file.size > MAX_FILE_BYTES) {
      setError(t('redirects.import.tooBig'));
      return;
    }
    try {
      setCsv(await file.text());
    } catch {
      setError(t('redirects.import.readFailed'));
    }
  }

  async function run(action: 'check' | 'apply') {
    setError('');
    setBusy(true);
    try {
      if (action === 'check') {
        setReport(await onCheck(csv));
      } else {
        onApplied(await onApply(csv));
        onOpenChange(false);
      }
    } catch (failure) {
      setError(actionErrorMessage(failure, t('redirects.import.failed')));
    } finally {
      setBusy(false);
    }
  }

  const problems = report?.rows.filter((row) => row.outcome === 'error') ?? [];
  const toImport = report === null ? 0 : report.created + report.updated;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('redirects.import.title')}</DialogTitle>
          <DialogDescription>
            {t('redirects.import.description')}
          </DialogDescription>
        </DialogHeader>

        {report === null ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              {t('redirects.import.format')}
            </p>
            <div className="flex flex-col gap-2">
              <input
                ref={fileInput}
                type="file"
                accept=".csv,text/csv,text/plain"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void readFile(file);
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="self-start"
                onClick={() => fileInput.current?.click()}
              >
                <FileUp />
                {t('redirects.import.chooseFile')}
              </Button>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${ids}-csv`}>
                {t('redirects.import.pasteLabel')}
              </Label>
              <Textarea
                id={`${ids}-csv`}
                value={csv}
                onChange={(event) => setCsv(event.target.value)}
                placeholder={t('redirects.import.pastePlaceholder')}
                rows={6}
                spellCheck={false}
                className="font-mono"
              />
            </div>
            <InlineError>{error}</InlineError>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                disabled={busy || csv.trim() === ''}
                onClick={() => void run('check')}
              >
                {busy
                  ? t('redirects.import.checking')
                  : t('redirects.import.check')}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p role="status" className="text-sm font-medium">
              {[
                report.created > 0 &&
                  t('redirects.import.summary.created', {
                    count: report.created,
                  }),
                report.updated > 0 &&
                  t('redirects.import.summary.updated', {
                    count: report.updated,
                  }),
                report.unchanged > 0 &&
                  t('redirects.import.summary.unchanged', {
                    count: report.unchanged,
                  }),
                report.failed > 0 &&
                  t('redirects.import.summary.failed', {
                    count: report.failed,
                  }),
              ]
                .filter((part) => part !== false)
                .join(' · ')}
            </p>
            {report.truncated && (
              <p className="text-sm text-warning">
                {t('redirects.import.truncated', {
                  max: MAX_REDIRECT_CSV_ROWS,
                })}
              </p>
            )}
            {problems.length > 0 && (
              <section
                aria-labelledby={`${ids}-problems`}
                className="flex flex-col gap-2"
              >
                <h3 id={`${ids}-problems`} className="text-sm font-semibold">
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
                          ...(row.detail === undefined
                            ? {}
                            : { detail: row.detail }),
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <InlineError>{error}</InlineError>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setReport(null);
                  setError('');
                }}
              >
                {t('redirects.import.back')}
              </Button>
              <Button
                type="button"
                disabled={busy || toImport === 0}
                onClick={() => void run('apply')}
              >
                {toImport === 0
                  ? t('redirects.import.nothingToImport')
                  : t('redirects.import.apply', { count: toImport })}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileUp } from 'lucide-react';
import { MAX_REDIRECT_CSV_ROWS } from '@kometio/shared-types';
import { Button } from '../../components/ui/button';
import { DialogFooter } from '../../components/ui/dialog';
import { InlineError } from '../../components/ui/inline-error';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { actionErrorMessage } from '../../lib/http-client';
import type { RedirectImportReport } from '../../lib/redirects-api-client';
import { ImportProblems, ReportSummary } from './import-problems';

/** What the API takes in one request (`importRedirectsBodySchema`): some forty thousand lines. */
const MAX_FILE_BYTES = 2_000_000;

export interface ImportListPanelProps {
  onCancel: () => void;
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
export function ImportListPanel({
  onCancel,
  onCheck,
  onApply,
  onApplied,
}: ImportListPanelProps) {
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
        onCancel();
      }
    } catch (failure) {
      setError(actionErrorMessage(failure, t('redirects.import.failed')));
    } finally {
      setBusy(false);
    }
  }

  const toImport = report === null ? 0 : report.created + report.updated;

  if (report === null) {
    return (
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
          <Button type="button" variant="outline" onClick={onCancel}>
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
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ReportSummary report={report} />
      {report.truncated && (
        <p className="text-sm text-warning">
          {t('redirects.import.truncated', { max: MAX_REDIRECT_CSV_ROWS })}
        </p>
      )}
      <ImportProblems report={report} />
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
  );
}

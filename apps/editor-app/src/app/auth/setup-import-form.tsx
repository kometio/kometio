import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { InlineError } from '../../components/ui/inline-error';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { formatBytes } from '../../lib/format-bytes';
import { AuthPage } from './auth-page';
import { useSiteImport } from './use-site-import';

export interface SetupImportFormProps {
  /** The site is here: the server has opened the archive and is back. */
  onImported: () => void;
  /** Back to setting up a new site. */
  onBack: () => void;
}

/**
 * The other way through the first-run screen (docs/adr/0106): a site that
 * already exists, from another Kometio, instead of a new one. The same gate as
 * the wizard, the setup token, and one file; no account to make, because the
 * accounts are in the archive.
 *
 * It says what to expect before the click and during the wait, because the wait
 * is long and strange: the server goes away and comes back, and this page keeps
 * asking until it does.
 */
export function SetupImportForm({ onImported, onBack }: SetupImportFormProps) {
  const { t } = useTranslation();
  const { state, start } = useSiteImport({ onImported });
  const [setupToken, setSetupToken] = useState('');
  const [file, setFile] = useState<File | null>(null);
  // Said under the file field when Open was pressed with no file: the form is
  // `noValidate`, so a rule answers under its field and not in the browser's bubble.
  const [fileMissing, setFileMissing] = useState(false);
  const tokenId = useId();
  const fileId = useId();
  const busy = state.step === 'uploading' || state.step === 'opening';

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (file === null) {
      setFileMissing(true);
      return;
    }
    void start(file, setupToken);
  }

  const percent =
    state.step === 'uploading' && state.total > 0
      ? Math.round((state.sent / state.total) * 100)
      : 0;

  return (
    <AuthPage
      title={t('setup.import.title')}
      description={t('setup.import.description')}
      width="md"
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor={tokenId}>{t('setup.tokenLabel')}</Label>
          <Input
            id={tokenId}
            value={setupToken}
            onChange={(event) => setSetupToken(event.target.value)}
            required
            autoFocus
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
          />
          <p className="text-xs text-muted-foreground">
            {t('setup.tokenHint')}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={fileId}>{t('setup.import.fileLabel')}</Label>
          <Input
            id={fileId}
            type="file"
            accept=".gz,.tgz,application/gzip"
            disabled={busy}
            aria-invalid={fileMissing ? true : undefined}
            aria-describedby={fileMissing ? `${fileId}-error` : undefined}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setFileMissing(false);
            }}
          />
          {fileMissing && (
            <InlineError id={`${fileId}-error`}>
              {t('setup.import.fileMissing')}
            </InlineError>
          )}
          <p className="text-xs text-muted-foreground">
            {t('setup.import.fileHint')}
          </p>
        </div>

        {state.step === 'uploading' && (
          <div className="flex flex-col gap-2">
            <div
              role="progressbar"
              aria-label={t('setup.import.uploading')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-valuetext={t('setup.import.progress', {
                sent: formatBytes(state.sent),
                total: formatBytes(state.total),
              })}
              className="h-2 overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="text-sm text-muted-foreground tabular-nums">
              {t('setup.import.progress', {
                sent: formatBytes(state.sent),
                total: formatBytes(state.total),
              })}
            </p>
          </div>
        )}

        {state.step === 'opening' && (
          <p role="status" className="text-sm">
            {t('setup.import.opening')}
          </p>
        )}

        {state.step === 'failed' && (
          <div className="flex flex-col gap-2">
            <InlineError>{state.message}</InlineError>
            {state.restarted && (
              <p className="text-xs text-muted-foreground">
                {t('setup.import.newToken')}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? t('setup.import.submitPending') : t('setup.import.submit')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            disabled={busy}
          >
            {t('setup.import.back')}
          </Button>
        </div>
      </form>
    </AuthPage>
  );
}

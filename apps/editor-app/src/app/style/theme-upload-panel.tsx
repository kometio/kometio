import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import type { ThemeUploadFailure } from '@kometio/shared-types';
import { Button } from '../../components/ui/button';
import { useTranslation } from '../../lib/use-translation';
import {
  getThemeUpload,
  getThemeUploadSettings,
  refusedUploadFailure,
  uploadTheme,
} from '../../lib/theme-uploads-api-client';
import { availableThemesQueryOptions } from '../settings/site-queries';

/** How often an upload's status is asked while it builds. */
const POLL_MS = 1500;

export interface ThemeUploadPanelProps {
  /** Makes the site use a theme — the same call the theme picker above makes. */
  onUse: (themeName: string) => void;
}

/**
 * Uploading a theme (docs/adr/0091): a zip in, and the editor says where
 * it has got to until the site can use it. Everything between happens on
 * the server by itself — nobody running the site touches Docker for it.
 */
export function ThemeUploadPanel({ onUse }: ThemeUploadPanelProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [refused, setRefused] = useState<ThemeUploadFailure | 'unknown' | null>(
    null,
  );

  const { data: settings } = useQuery({
    queryKey: ['themes', 'uploads', 'settings'] as const,
    queryFn: getThemeUploadSettings,
    staleTime: Infinity,
  });
  const { data: upload } = useQuery({
    queryKey: ['themes', 'uploads', uploadId] as const,
    queryFn: async () => {
      const status = await getThemeUpload(uploadId ?? '');
      // The picker's list is cached for good (a deployment's bundled
      // themes never change); a published upload is the one thing that
      // changes it.
      if (status.state === 'published') {
        await queryClient.invalidateQueries({
          queryKey: availableThemesQueryOptions().queryKey,
        });
      }
      return status;
    },
    enabled: uploadId !== null,
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state === 'published' || state === 'failed' ? false : POLL_MS;
    },
  });

  if (!settings?.enabled) return null;

  async function send(file: File) {
    setSending(true);
    setRefused(null);
    setUploadId(null);
    try {
      setUploadId((await uploadTheme(file)).id);
    } catch (error) {
      setRefused(refusedUploadFailure(error) ?? 'unknown');
    } finally {
      setSending(false);
      if (input.current) input.current.value = '';
    }
  }

  const failure =
    refused ?? (upload?.state === 'failed' ? upload.failure : null);
  const name = upload?.name ?? '';

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        {t('globalStyles.themeUpload.hint')}
      </p>
      <input
        ref={input}
        type="file"
        accept=".zip,application/zip"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void send(file);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        disabled={
          sending || upload?.state === 'queued' || upload?.state === 'building'
        }
        onClick={() => input.current?.click()}
      >
        <Upload aria-hidden="true" />
        {t('globalStyles.themeUpload.choose')}
      </Button>
      <div role="status" aria-live="polite" className="text-xs">
        {sending && <p>{t('globalStyles.themeUpload.sending')}</p>}
        {upload?.state === 'queued' && (
          <p>{t('globalStyles.themeUpload.queued', { name })}</p>
        )}
        {upload?.state === 'building' && (
          <p>{t('globalStyles.themeUpload.building', { name })}</p>
        )}
        {upload?.state === 'published' && (
          <div className="flex flex-wrap items-center gap-2">
            <p>{t('globalStyles.themeUpload.published', { name })}</p>
            <Button type="button" size="sm" onClick={() => onUse(name)}>
              {t('globalStyles.themeUpload.use', { name })}
            </Button>
          </div>
        )}
      </div>
      {failure && (
        <div
          role="alert"
          className="flex flex-col gap-1 text-sm text-destructive"
        >
          <p>{t(`globalStyles.themeUpload.failures.${failure}`)}</p>
          {upload?.log && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">
                {t('globalStyles.themeUpload.log')}
              </summary>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap">
                {upload.log}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

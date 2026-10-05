import { Download, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { siteArchiveUrl } from '../../lib/site-archive-api-client';
import { SettingsSectionHeader } from './settings-section';

function Group({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Settings → Export (docs/adr/0105): the whole site in one file, which another
 * Kometio can open. Offered only where the server can make it, which is the
 * single Docker image, and an administrator's like the other settings that
 * decide who can sign in: the file holds every account's password hash.
 *
 * It says what travels and what does not before the person has a file in
 * their hands, and that the file is a secret, because nothing about a
 * download says so.
 */
export function SiteArchiveSection() {
  const { t } = useTranslation();

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <SettingsSectionHeader
        title={t('settings.nav.items.export')}
        description={t('siteArchive.description')}
      />

      <div className="grid gap-6 sm:grid-cols-2">
        <Group
          title={t('siteArchive.includes.title')}
          items={[
            t('siteArchive.includes.content'),
            t('siteArchive.includes.accounts'),
            t('siteArchive.includes.files'),
          ]}
        />
        <Group
          title={t('siteArchive.excludes.title')}
          items={[
            t('siteArchive.excludes.sessions'),
            t('siteArchive.excludes.submissions'),
            t('siteArchive.excludes.aiKey'),
          ]}
        />
      </div>

      <div className="flex gap-3 rounded-lg border p-3 text-sm">
        <TriangleAlert
          aria-hidden
          className="mt-0.5 size-4 shrink-0 text-warning"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-medium">{t('siteArchive.secret.title')}</p>
          <p className="text-muted-foreground">
            {t('siteArchive.secret.body')}
          </p>
        </div>
      </div>

      <div className="flex flex-col items-start gap-2">
        <Button asChild>
          {/* `download` is honoured on the same origin; across two it is
              ignored and the file arrives all the same (the answer says it
              is an attachment), and a refusal opens in a new tab instead of
              taking the editor's place. */}
          <a
            href={siteArchiveUrl()}
            download
            target="_blank"
            rel="noopener noreferrer"
          >
            <Download />
            {t('siteArchive.download')}
          </a>
        </Button>
        <p className="text-xs text-muted-foreground">
          {t('siteArchive.downloadHint')}
        </p>
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <h3 className="text-sm font-medium">{t('siteArchive.open.title')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('siteArchive.open.body')}
        </p>
        {/* Wrapped, not scrolled: a command longer than a phone is still all there to read and to copy. */}
        <code className="block rounded-lg border bg-muted/50 p-3 font-mono text-xs break-words whitespace-pre-wrap">
          {t('siteArchive.open.command')}
        </code>
        <p className="text-sm text-muted-foreground">
          {t('siteArchive.open.after')}
        </p>
      </div>
    </div>
  );
}

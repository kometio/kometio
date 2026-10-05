import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { useServerSendsEmail } from './deployment-queries';

export interface EmailNotConfiguredNoticeProps {
  /** Layout only (a margin, a width), never a size or a colour. */
  className?: string;
}

/**
 * Says, to whoever is about to depend on it, that this deployment has no mail
 * server (docs/adr/0103). Without one the emails are written to the server's
 * log, links included, so an invitation is "sent" and never arrives: nothing
 * else in the product would say why.
 *
 * It is true or it is absent. It draws nothing while the answer is unknown or
 * when the server could not be asked: a warning that might be wrong is worse
 * than none. No "dismiss": it is a fact about the server, gone only when the
 * server has a mail server.
 *
 * Quiet, as the rest of the editor is: a neutral card with the warning colour
 * on the icon alone, which is decoration; the words carry the meaning.
 */
export function EmailNotConfiguredNotice({
  className,
}: EmailNotConfiguredNoticeProps) {
  const { t } = useTranslation();
  const sendsEmail = useServerSendsEmail();

  if (sendsEmail) return null;

  return (
    <div
      role="status"
      className={cn('flex gap-3 rounded-lg border p-3 text-sm', className)}
    >
      <TriangleAlert
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-warning"
      />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-medium">{t('emailNotice.title')}</p>
        <p className="text-muted-foreground">{t('emailNotice.body')}</p>
      </div>
    </div>
  );
}

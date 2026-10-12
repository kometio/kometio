import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { useIsDemo } from './deployment-queries';

export interface DemoNoticeProps {
  /** Layout only (a margin, a width), never a size or a colour. */
  className?: string;
}

/**
 * Says, to whoever opened the editor of a public demo (docs/adr/0118), what
 * it is: shared with others, started over from time to time, and without
 * uploads and the account's own settings. Without it the first upload
 * would be refused with no sentence in the screen to say why.
 *
 * It is true or it is absent: nothing is drawn while the server has not
 * said it is a demo. Quiet, like the rest of the editor: a neutral card
 * with the icon as decoration, the words carrying the meaning.
 */
export function DemoNotice({ className }: DemoNoticeProps) {
  const { t } = useTranslation();
  if (!useIsDemo()) return null;

  return (
    <div
      role="status"
      className={cn(
        'mb-4 flex items-start gap-3 rounded-lg border bg-muted/40 p-3 text-sm',
        className,
      )}
    >
      <Info
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
      />
      <p>{t('demo.notice')}</p>
    </div>
  );
}

import { Link } from '@tanstack/react-router';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import { useCurrentSession } from '../auth/use-current-session';
import { siteQueryOptions } from '../settings/site-queries';
import { starterOfferQueryOptions } from './starter-queries';

export interface StarterNoticeProps {
  /** Layout only (a margin, a width), never a size or a colour. */
  className?: string;
}

/**
 * Says, at the top of the pages, that the site is still the one the wizard
 * made and what could be done about it (docs/adr/0136): the way back to the
 * choice for somebody who skipped it, or who did not know it was there.
 *
 * It is a fact about the site, so it is gone for good once the site has a
 * page of its own, and it is drawn only for who may act on it. It draws
 * nothing while the answer is unknown: a suggestion that might be wrong is
 * worse than none.
 */
export function StarterNotice({ className }: StarterNoticeProps) {
  const { t } = useTranslation();
  const { can } = useCurrentSession();
  const { data: site } = useQuery(siteQueryOptions());
  const mayChoose = can('configureSite');
  const { data: offer } = useQuery({
    ...starterOfferQueryOptions(site?.id ?? ''),
    enabled: mayChoose && site !== undefined,
  });

  if (!mayChoose || !offer?.available) return null;

  return (
    <div
      role="status"
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm',
        className,
      )}
    >
      <Sparkles aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-medium">{t('starters.notice.title')}</p>
        <p className="text-muted-foreground">{t('starters.notice.body')}</p>
      </div>
      <Button asChild variant="outline" size="sm">
        <Link to="/starter">{t('starters.notice.action')}</Link>
      </Button>
    </div>
  );
}

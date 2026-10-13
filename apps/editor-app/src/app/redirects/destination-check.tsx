import { Check, TriangleAlert } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '../common/use-debounced-value';
import { redirectTestQueryOptions } from './redirects-queries';

export interface DestinationCheckProps {
  siteId: string;
  /** What was typed as the destination. */
  address: string;
}

/**
 * Whether a path typed as a destination is somewhere the site answers.
 *
 * A rule to `/en/blog/post-nwe` is accepted — the page may be about to be
 * made — and then sends every visitor to "not found": the one mistake in a
 * redirect that a person cannot see from the list. So the path is asked of
 * the same function the site answers with (`/redirects/test`) while it is
 * typed, and said in a line under the field. It never blocks: it is a
 * sentence, not a rule.
 *
 * Only a path of this site is asked about; another site's address is not
 * ours to know, and a pattern's `:slug` is not an address yet.
 */
export function DestinationCheck({ siteId, address }: DestinationCheckProps) {
  const { t } = useTranslation();
  const settled = useDebouncedValue(address.trim(), 400);
  const isPath =
    settled.startsWith('/') && !settled.includes(':') && !settled.includes('*');
  const isOtherSite = /^https?:\/\//i.test(settled);

  const { data } = useQuery({
    ...redirectTestQueryOptions(siteId, settled),
    enabled: isPath,
    retry: false,
  });

  if (isOtherSite) {
    return <Line tone="neutral">{t('redirects.dialog.check.other')}</Line>;
  }
  if (!isPath || data === undefined || settled !== address.trim()) return null;

  switch (data.outcome) {
    case 'page':
      return <Line tone="ok">{t('redirects.dialog.check.page')}</Line>;
    case 'moved':
      return (
        <Line tone="warning">
          {t('redirects.dialog.check.moved', { location: data.location })}
        </Line>
      );
    case 'redirect':
      return (
        <Line tone="warning">
          {t('redirects.dialog.check.redirect', { location: data.location })}
        </Line>
      );
    case 'gone':
      return <Line tone="warning">{t('redirects.dialog.check.gone')}</Line>;
    case 'broken':
      return <Line tone="warning">{t('redirects.dialog.check.broken')}</Line>;
    case 'loop':
      return <Line tone="warning">{t('redirects.dialog.check.loop')}</Line>;
    case 'none':
      return <Line tone="warning">{t('redirects.dialog.check.none')}</Line>;
  }
}

function Line({
  tone,
  children,
}: {
  tone: 'ok' | 'warning' | 'neutral';
  children: string;
}) {
  // The icon is decoration: the sentence carries the meaning, and a state is
  // never told by colour alone (DESIGN.md §7).
  return (
    <p
      role="status"
      className={
        tone === 'warning'
          ? 'flex items-start gap-1.5 text-xs text-warning'
          : 'flex items-start gap-1.5 text-xs text-muted-foreground'
      }
    >
      {tone === 'warning' ? (
        <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
      ) : tone === 'ok' ? (
        <Check aria-hidden className="mt-px size-3.5 shrink-0" />
      ) : null}
      <span>{children}</span>
    </p>
  );
}

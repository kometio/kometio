import { useTranslation } from 'react-i18next';
import { Pencil } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { cn } from '../../lib/utils';
import { useFormatDate } from '../../lib/use-format-date';
import type { RedirectRecord } from '../../lib/redirects-api-client';

export interface RedirectRowProps {
  redirect: RedirectRecord;
  /** Offered only to who may delete: the box is how a rule is chosen for it. */
  selectable: boolean;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
  onEdit: () => void;
}

/**
 * One rule of the list, read as a sentence: the old address, where it goes,
 * and what has happened to it since.
 *
 * Address and destination are blocks that shorten (`min-w-0`, `truncate`)
 * and never run under the actions: a WordPress address can be long. What
 * needs attention is a badge with its words, never colour alone — a rule
 * that answers nothing is "Needs a destination", and one whose page is a
 * draft says so.
 */
export function RedirectRow({
  redirect,
  selectable,
  selected,
  onSelectedChange,
  onEdit,
}: RedirectRowProps) {
  const { t } = useTranslation();
  const formatDate = useFormatDate();
  const { target } = redirect;
  const isGone = redirect.status === 410;
  const lastVisit =
    redirect.lastHitAt === null ? null : formatDate(redirect.lastHitAt);
  const draftTitle =
    target?.kind === 'page' &&
    target.pageGroupId !== null &&
    !target.isPublished
      ? target.title
      : null;

  return (
    <li
      // The row carries the state, not the box inside it — as the pages and
      // the forms lists do.
      className={cn(
        'relative flex items-start gap-3 px-3 py-2.5 before:absolute before:inset-y-0 before:left-0 before:w-0.75',
        selected
          ? 'bg-muted before:bg-primary'
          : 'hover:bg-muted/50 before:bg-transparent',
      )}
    >
      {selectable && (
        <span className="flex h-5 shrink-0 items-center">
          <Checkbox
            checked={selected}
            onCheckedChange={(next) => onSelectedChange(next === true)}
            aria-label={t('redirects.row.select', { from: redirect.from })}
          />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-mono text-sm font-medium">
            {redirect.from}
          </span>
          {redirect.kind === 'pattern' && (
            <Badge variant="secondary" className="shrink-0">
              {t('redirects.row.pattern')}
            </Badge>
          )}
        </span>
        <span className="flex min-w-0 items-baseline gap-1.5 text-sm text-muted-foreground">
          <span aria-hidden>→</span>
          <span className="sr-only">{t('redirects.row.goesTo')}</span>
          <Destination redirect={redirect} />
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground tabular-nums">
          <span>
            {isGone
              ? t('redirects.row.status.gone')
              : redirect.status === 302
                ? t('redirects.row.status.temporary')
                : t('redirects.row.status.permanent')}
          </span>
          <span aria-hidden>·</span>
          <span>
            {redirect.hits === 0
              ? t('redirects.row.noVisits')
              : t('redirects.row.visits', { count: redirect.hits })}
            {lastVisit &&
              `, ${t('redirects.row.lastVisit', { date: lastVisit })}`}
          </span>
          {redirect.origin !== 'manual' && (
            <Badge variant="outline">
              {t(`redirects.row.origin.${redirect.origin}`)}
            </Badge>
          )}
          {redirect.needsATarget && (
            <Badge variant="warning">{t('redirects.row.needsTarget')}</Badge>
          )}
          {draftTitle !== null && (
            <Badge variant="warning">{t('redirects.row.notPublished')}</Badge>
          )}
        </span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onEdit}
        aria-label={t('redirects.row.editLabel', { from: redirect.from })}
        className="shrink-0"
      >
        <Pencil />
        {t('redirects.row.edit')}
      </Button>
    </li>
  );
}

function Destination({ redirect }: { redirect: RedirectRecord }) {
  const { t } = useTranslation();
  const { target } = redirect;
  if (redirect.status === 410 || target === null) {
    return <span className="truncate">{t('redirects.row.removed')}</span>;
  }
  if (target.kind === 'url') {
    return <span className="truncate font-mono">{target.url}</span>;
  }
  if (target.pageGroupId === null) {
    return <span className="truncate">{t('redirects.row.pageDeleted')}</span>;
  }
  return (
    <span className="flex min-w-0 items-baseline gap-2">
      <span className="truncate">
        {target.title || t('redirects.dialog.to.page.untitled')}
      </span>
      {target.path !== null && (
        <span className="truncate font-mono text-xs">{target.path}</span>
      )}
    </span>
  );
}

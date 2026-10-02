import { useId } from 'react';
import { Check } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { cn } from '../../lib/utils';
import type { LaunchChecklistItem } from './launch-checklist';

export interface LaunchChecklistCardProps {
  items: readonly LaunchChecklistItem[];
}

/**
 * What the site still needs before it is ready to be found, as a list that
 * can be worked down: each item says whether it is done in words as well as
 * in its mark, and what is left has the button that goes and does it.
 *
 * It is a list with a title and a progress bar, not a banner: it stays on
 * the dashboard until the last item is done, and then it is gone — there is
 * no "dismiss", because a thing that can be hidden without being done is a
 * thing that comes back as a reminder nobody trusts.
 */
export function LaunchChecklistCard({ items }: LaunchChecklistCardProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const doneCount = items.filter((item) => item.done).length;
  const percent = Math.round((doneCount / items.length) * 100);

  return (
    <Card>
      <CardHeader>
        <CardTitle id={titleId}>{t('dashboard.checklist.title')}</CardTitle>
        <div className="flex items-center gap-3 pt-1">
          <div
            role="progressbar"
            aria-label={t('dashboard.checklist.title')}
            aria-valuemin={0}
            aria-valuemax={items.length}
            aria-valuenow={doneCount}
            aria-valuetext={t('dashboard.checklist.progress', {
              done: doneCount,
              total: items.length,
            })}
            className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-success"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="text-sm text-muted-foreground tabular-nums">
            {t('dashboard.checklist.progress', {
              done: doneCount,
              total: items.length,
            })}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <ul aria-labelledby={titleId} className="flex flex-col divide-y">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-2.5">
              {/* The mark is the picture of the state; the words after it
                  are the state. A screen reader gets the words. */}
              <span
                aria-hidden
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-full',
                  item.done
                    ? 'bg-success text-success-foreground'
                    : 'border-2 border-border',
                )}
              >
                {item.done && <Check className="size-3" />}
              </span>
              <span
                className={cn(
                  'min-w-0 flex-1 text-sm',
                  item.done && 'text-muted-foreground line-through',
                )}
              >
                {item.waitingScripts
                  ? t('dashboard.checklist.items.cookies.waiting', {
                      count: item.waitingScripts,
                    })
                  : t(`dashboard.checklist.items.${item.id}.label`)}
              </span>
              <span className="sr-only">
                {item.done
                  ? t('dashboard.checklist.done')
                  : t('dashboard.checklist.todo')}
              </span>
              {!item.done && (
                <Button asChild variant="outline" size="sm">
                  <Link to={item.to}>
                    {item.waitingScripts
                      ? t('dashboard.checklist.items.cookies.waitingAction')
                      : t(`dashboard.checklist.items.${item.id}.action`)}
                  </Link>
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

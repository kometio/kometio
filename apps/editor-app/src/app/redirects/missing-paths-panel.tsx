import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { InlineError } from '../../components/ui/inline-error';
import { SkeletonRows } from '../../components/ui/skeleton';
import { actionErrorMessage } from '../../lib/http-client';
import { useFormatDate } from '../../lib/use-format-date';
import { Pagination } from '../common/pagination';
import { useToast } from '../shell/toast-provider';
import {
  MISSING_PATHS_PAGE_SIZE,
  missingPathsQueryOptions,
} from './redirects-queries';
import { useRedirects } from './use-redirects';

export interface MissingPathsPanelProps {
  siteId: string;
  page: number;
  onPageChange: (page: number) => void;
  /** Starts a rule for this address: what the list is for. */
  onRedirect: (path: string) => void;
}

/**
 * What visitors asked for and the site did not have, most asked first: the
 * list a person turns into rules after moving a site, one "Redirect…" at a
 * time. A row that is not worth a rule (a bot, a typo in somebody's link)
 * is "Ignored", which only takes it off this list.
 */
export function MissingPathsPanel({
  siteId,
  page,
  onPageChange,
  onRedirect,
}: MissingPathsPanelProps) {
  const { t } = useTranslation();
  const formatDate = useFormatDate();
  const { toast } = useToast();
  const { dismissMissingPath } = useRedirects(siteId);
  const { data, isPending, isError } = useQuery(
    missingPathsQueryOptions(siteId, page),
  );
  const [error, setError] = useState('');

  async function handleIgnore(id: string, path: string) {
    setError('');
    try {
      await dismissMissingPath(id);
      toast(t('redirects.missing.ignored', { path }), 'success');
    } catch (failure) {
      setError(actionErrorMessage(failure, t('redirects.missing.failed')));
    }
  }

  const totalPages = Math.max(
    1,
    Math.ceil((data?.total ?? 0) / MISSING_PATHS_PAGE_SIZE),
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {t('redirects.missing.description')}
      </p>
      <p className="text-xs text-muted-foreground">
        {t('redirects.missing.privacy')}
      </p>
      <InlineError>{error}</InlineError>
      {isPending && <SkeletonRows />}
      {isError && <InlineError>{t('redirects.loadFailed')}</InlineError>}
      {data && data.items.length === 0 && (
        <div className="rounded-lg border border-dashed p-6">
          <p className="text-sm text-muted-foreground">
            {t('redirects.missing.empty')}
          </p>
        </div>
      )}
      {data && data.items.length > 0 && (
        <ul className="divide-y rounded-md border">
          {data.items.map((item) => {
            const lastSeen = formatDate(item.lastSeenAt);
            return (
              <li
                key={item.id}
                className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-mono text-sm font-medium">
                    {item.path}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {t('redirects.missing.visits', { count: item.hits })}
                    {lastSeen &&
                      `, ${t('redirects.missing.lastSeen', { date: lastSeen })}`}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={t('redirects.missing.redirectLabel', {
                      path: item.path,
                    })}
                    onClick={() => onRedirect(item.path)}
                  >
                    {t('redirects.missing.redirect')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={t('redirects.missing.ignoreLabel', {
                      path: item.path,
                    })}
                    onClick={() => void handleIgnore(item.id, item.path)}
                  >
                    {t('redirects.missing.ignore')}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={onPageChange}
      />
    </div>
  );
}

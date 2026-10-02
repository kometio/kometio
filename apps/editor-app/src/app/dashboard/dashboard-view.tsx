import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { ClipboardList, FileText } from 'lucide-react';
import type { SiteRecord } from '@kometio/api-contracts';
import { Button } from '../../components/ui/button';
import { PUBLIC_SITE_URL } from '../../lib/public-site-url';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import type { DashboardStatsDto } from '../../lib/dashboard-api-client';
import { useFormatDate } from '../../lib/use-format-date';
import { useCurrentSession } from '../auth/use-current-session';
import { pageStatusBadge } from '../pages/page-status';
import { PageHeader } from '../shell/page-header';
import { launchChecklist } from './launch-checklist';
import { LaunchChecklistCard } from './launch-checklist-card';
import { mergeActivity } from './recent-activity';
import { formatBytes } from '../../lib/format-bytes';

export interface DashboardViewProps {
  stats: DashboardStatsDto;
  site: SiteRecord;
  /** How many forms the site has — the stats count the answers, and a site with none needs a way to make one, not a zero. */
  formCount: number;
}

/** How many entries the feed shows: a glance at what happened, not a log. */
const ACTIVITY_LIMIT = 8;

/** One of the three numbers, all of them a way into the list they count. */
function StatCard({
  to,
  title,
  value,
  detail,
}: {
  to: '/pages' | '/media' | '/forms';
  title: string;
  value: number;
  detail: string;
}) {
  return (
    // The whole card is the link: a number that says how many, and takes you
    // to them. The frame shows on focus like every other control's ring.
    <Link
      to={to}
      className="group/stat block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Card className="h-full transition-colors group-hover/stat:bg-muted/50">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <span className="text-2xl font-semibold tabular-nums">{value}</span>
          <span className="text-sm text-muted-foreground">{detail}</span>
        </CardContent>
      </Card>
    </Link>
  );
}

/**
 * The forms card of a site that has none: not a zero, a way to make one.
 *
 * Not a link like its neighbours: it holds a button, and a button inside a
 * link is neither valid nor operable. Only offered to who may make a form
 * (docs/roles.md); everyone else keeps the count.
 */
function NoFormsCard() {
  const { t } = useTranslation();
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t('dashboard.stats.submissions.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-3">
        <span className="text-sm text-muted-foreground">
          {t('dashboard.stats.submissions.noForms')}
        </span>
        <Button asChild variant="outline" size="sm">
          <Link to="/forms" search={{ page: 1, new: true }}>
            {t('dashboard.stats.submissions.createForm')}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function DashboardView({ stats, site, formCount }: DashboardViewProps) {
  const { t } = useTranslation();
  const formatDate = useFormatDate('dateTime');
  const { can } = useCurrentSession();
  const totalPages = stats.pages.publishedCount + stats.pages.draftCount;

  const checklist = launchChecklist(site, stats);
  // A site's readiness is the admin's to act on: name, domain, banner and
  // indexing are all settings an editor may not change, so a list of
  // buttons that send them back to the dashboard would only be noise. And
  // once every item is done there is nothing left to say.
  const showChecklist =
    can('configureSite') && checklist.some((item) => !item.done);

  const activity = mergeActivity(stats, ACTIVITY_LIMIT);
  const hasNothingYet = totalPages === 0 && stats.forms.totalCount === 0;

  return (
    <div className="flex flex-col gap-6">
      {/*
        The first screen after login had no action on it at all — four
        cards of numbers and a list. "New page" opens the dialog itself:
        it used to be a button labelled "Pages" that went to the list, next
        to one labelled "Media" that went to the other list, both already
        in the sidebar and filled like actions.

        The line under the title says which site this is and whether it is
        online: the shell used to say neither.
      */}
      <PageHeader
        title={t('dashboard.title')}
        description={
          site.domain
            ? t('dashboard.description.online', {
                name: site.name,
                domain: site.domain,
              })
            : t('dashboard.description.offline', { name: site.name })
        }
        actions={
          <>
            <Button asChild variant="outline">
              <a
                href={PUBLIC_SITE_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('dashboard.actions.openSite')}
              </a>
            </Button>
            <Button asChild>
              <Link to="/pages" search={{ page: 1, new: true }}>
                {t('dashboard.actions.newPage')}
              </Link>
            </Button>
          </>
        }
      />

      <div
        className={
          showChecklist
            ? 'grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,11fr)_minmax(0,9fr)]'
            : 'flex flex-col gap-6'
        }
      >
        {showChecklist && <LaunchChecklistCard items={checklist} />}

        <div className="flex flex-col gap-6">
          {/* Three cards of the same height: they sit in a grid that
              stretches them, so a number with a longer line under it does
              not leave its neighbours short. */}
          <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-3">
            <StatCard
              to="/pages"
              title={t('dashboard.stats.pages.title')}
              value={totalPages}
              detail={t('dashboard.stats.pages.breakdown', {
                published: stats.pages.publishedCount,
                draft: stats.pages.draftCount,
              })}
            />
            <StatCard
              to="/media"
              title={t('dashboard.stats.media.title')}
              value={stats.media.count}
              detail={formatBytes(stats.media.totalSizeBytes)}
            />
            {formCount === 0 && can('changeLiveSite') ? (
              <NoFormsCard />
            ) : (
              <StatCard
                to="/forms"
                title={t('dashboard.stats.submissions.title')}
                value={stats.forms.totalCount}
                detail={t('dashboard.stats.submissions.recentLabel', {
                  count: stats.forms.recentCount,
                })}
              />
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('dashboard.recentActivity.title')}</CardTitle>
              <CardDescription>
                {t('dashboard.recentActivity.description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {activity.length === 0 ? (
                hasNothingYet ? (
                  <div className="flex flex-col items-start gap-3">
                    <p className="text-sm text-muted-foreground">
                      {t('dashboard.emptyState')}
                    </p>
                    <Button asChild variant="outline">
                      <Link to="/pages" search={{ page: 1, new: true }}>
                        {t('dashboard.actions.newPage')}
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t('dashboard.recentActivity.empty')}
                  </p>
                )
              ) : (
                <ul className="flex flex-col divide-y">
                  {activity.map((entry) => (
                    // Its details go under the title on a phone, where on
                    // one line they left the title three words and an
                    // ellipsis.
                    <li
                      key={entry.key}
                      className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                    >
                      {entry.kind === 'page' ? (
                        // To the page itself: every row used to open the list.
                        <Link
                          to="/page-groups/$groupId"
                          params={{ groupId: entry.page.pageGroupId }}
                          className="flex min-w-0 items-center gap-2 hover:underline"
                        >
                          <FileText className="size-4 shrink-0 text-muted-foreground" />
                          <span className="truncate text-sm font-medium">
                            {entry.page.title || entry.page.slug}
                          </span>
                        </Link>
                      ) : (
                        // To the answers themselves, not to the form's
                        // fields: that is what the row is about.
                        <Link
                          to="/forms/$formId"
                          params={{ formId: entry.formId }}
                          search={{ tab: 'submissions', page: 1 }}
                          className="flex min-w-0 items-center gap-2 hover:underline"
                        >
                          <ClipboardList className="size-4 shrink-0 text-muted-foreground" />
                          <span className="truncate text-sm font-medium">
                            {entry.formName}
                          </span>
                        </Link>
                      )}
                      <div className="flex shrink-0 items-center gap-2 pl-6 sm:pl-0">
                        {entry.kind === 'page' ? (
                          <>
                            <Badge variant="outline" className="uppercase">
                              {entry.page.locale}
                            </Badge>
                            {/* A state, so a state colour: published was
                                the brand blue, the colour of the primary
                                button beside it. */}
                            {/* The same words and colours as the pages
                                list: a page online whose draft has moved on
                                is the one that costs somebody something. */}
                            <PageStatusBadge
                              status={entry.page.status}
                              hasUnpublishedChanges={
                                entry.page.hasUnpublishedChanges
                              }
                            />
                          </>
                        ) : (
                          <Badge variant="success">
                            {t('dashboard.recentActivity.newSubmissions', {
                              count: entry.count,
                            })}
                          </Badge>
                        )}
                        <time
                          dateTime={entry.at}
                          className="text-xs text-muted-foreground tabular-nums"
                        >
                          {formatDate(entry.at)}
                        </time>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** A page's state as a badge, worded and coloured by the one helper the pages list uses too. */
function PageStatusBadge({
  status,
  hasUnpublishedChanges,
}: {
  status: Parameters<typeof pageStatusBadge>[0];
  hasUnpublishedChanges: boolean;
}) {
  const { t } = useTranslation();
  const { key, variant } = pageStatusBadge(status, hasUnpublishedChanges);
  return <Badge variant={variant}>{t(key)}</Badge>;
}

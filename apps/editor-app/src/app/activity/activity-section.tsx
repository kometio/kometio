import { useTranslation } from 'react-i18next';
import type { ActivityEntry } from '@kometio/api-contracts';
import { AUDIT_RETENTION_DAYS } from '@kometio/shared-types';
import { useFormatDate } from '../../lib/use-format-date';
import { Pagination } from '../common/pagination';
import { SettingsSectionHeader } from '../settings/settings-section';
import { ACTIVITY_PAGE_SIZE } from './activity-queries';
import { activitySentence } from './activity-sentence';

export interface ActivitySectionProps {
  items: ActivityEntry[];
  page: number;
  total: number;
  onPageChange: (page: number) => void;
}

/**
 * Settings → Activity (docs/adr/0130): who did what to the site, newest
 * first. It is what to open when something has changed and nobody says who
 * changed it, and when a sign-in is not the person's own.
 *
 * It lists security and configuration events and nothing else: not a page
 * that was edited, not a visitor. It keeps no address and no request, and
 * forgets what is older than the retention, which it says.
 */
export function ActivitySection({
  items,
  page,
  total,
  onPageChange,
}: ActivitySectionProps) {
  const { t } = useTranslation();
  const formatDate = useFormatDate('dateTime');
  const totalPages = Math.max(1, Math.ceil(total / ACTIVITY_PAGE_SIZE));

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <SettingsSectionHeader
        title={t('settings.nav.items.activity')}
        description={t('activity.description', {
          days: AUDIT_RETENTION_DAYS,
        })}
      />
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('activity.empty')}</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {items.map((entry) => {
            const sentence = activitySentence(entry);
            const { role, section, reason } = sentence.values;
            const when = formatDate(entry.at);
            return (
              <li
                key={entry.id}
                className="flex flex-col gap-0.5 p-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="min-w-0 text-sm break-words">
                    {t(sentence.key, {
                      ...sentence.values,
                      // The facts that are words of their own are said in the
                      // person's language, not as the server names them.
                      role: role ? t(`users.role.${role}`) : '',
                      section: section
                        ? t(`activity.sections.${section}`, {
                            defaultValue: section,
                          })
                        : '',
                      reason: reason
                        ? t(`activity.reasons.${reason}`, {
                            defaultValue: reason,
                          })
                        : '',
                    })}
                  </p>
                  {/* A refused sign-in names the account it was tried on in its
                      own sentence: the account did not do it. */}
                  {entry.action !== 'login.failed' && (
                    <p className="min-w-0 text-xs break-all text-muted-foreground">
                      {entry.actor
                        ? t('activity.by', {
                            who: entry.actor.displayName ?? entry.actor.email,
                          })
                        : t('activity.byRemoved')}
                    </p>
                  )}
                </div>
                <time
                  dateTime={entry.at}
                  className="shrink-0 text-xs text-muted-foreground tabular-nums"
                >
                  {when}
                </time>
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

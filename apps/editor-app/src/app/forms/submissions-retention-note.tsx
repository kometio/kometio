import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { siteQueryOptions } from '../settings/site-queries';
import { useCurrentSession } from '../auth/use-current-session';

/**
 * How long the answers are kept, said where the answers are.
 *
 * It is one setting for the whole site and lives in Settings, where nobody
 * looking at a form's answers would think to look: "will these be here in a
 * year?" is a question about THIS list. The way to change it is offered
 * only to who may (docs/roles.md) — a link that ends in "not allowed" is a
 * worse answer than no link.
 */
export function SubmissionsRetentionNote() {
  const { t } = useTranslation();
  const { data: site } = useQuery(siteQueryOptions());
  const canConfigure = useCurrentSession().can('configureSite');
  // Not said until it is known: "kept forever" for a second before
  // "deleted after 90 days" would be a wrong answer on the screen.
  if (!site) return null;

  const days = site.formSubmissionRetentionDays;
  return (
    <p className="text-sm text-muted-foreground">
      {days === null
        ? t('forms.submissions.retention.forever')
        : t('forms.submissions.retention.days', { count: days })}
      {canConfigure && (
        <>
          {' · '}
          <Link
            to="/settings/retention"
            className="font-medium text-foreground underline underline-offset-2"
          >
            {t('forms.submissions.retention.change')}
          </Link>
        </>
      )}
    </p>
  );
}

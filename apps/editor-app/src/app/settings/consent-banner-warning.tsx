import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { TriangleAlert } from 'lucide-react';
import type { SiteRecord } from '@kometio/api-contracts';
import { scriptsWaitingForConsent } from './consent-warning';

export interface ConsentBannerWarningProps {
  site: Pick<SiteRecord, 'themeTrackerScripts' | 'cookieBannerSettings'>;
  /** On the cookie banner's own page the way to turn it on is a few lines down: no link to itself. */
  onCookiesPage?: boolean;
}

/**
 * The warning that scripts are waiting for a banner that is off.
 *
 * The banner is not made compulsory — a site may have none — but a script
 * that asks for consent from a banner that is not there does not run for
 * anyone, and nothing said so: the analytics simply never counted. Said
 * where the scripts are, and where the banner is.
 */
export function ConsentBannerWarning({
  site,
  onCookiesPage = false,
}: ConsentBannerWarningProps) {
  const { t } = useTranslation();
  const waiting = scriptsWaitingForConsent(site);
  if (waiting === 0) return null;

  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        {t('integrations.consentWarning', { count: waiting })}{' '}
        {onCookiesPage ? (
          t('integrations.consentWarningHere')
        ) : (
          <Link to="/settings/cookies" className="font-medium underline">
            {t('integrations.consentWarningAction')}
          </Link>
        )}
      </p>
    </div>
  );
}

import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getLocaleDisplayName, type StarterId } from '@kometio/shared-types';
import { ApiError, actionErrorMessage } from '../lib/http-client';
import { AuthPage } from '../app/auth/auth-page';
import { siteQueryOptions } from '../app/settings/site-queries';
import { StarterPicker } from '../app/starters/starter-picker';
import { starterOfferQueryOptions } from '../app/starters/starter-queries';
import { useApplyStarter } from '../app/starters/use-apply-starter';
import { useToast } from '../app/shell/toast-provider';
import { requireAuth } from './-require-auth';
import { requirePermission } from './-require-permission';

/**
 * Where a person lands right after the first-run wizard, and where the
 * notice on a site's first page leads (docs/adr/0136): a new site's starting
 * point. Outside the shell, like the wizard it follows — the editor is not
 * what this is about yet.
 *
 * Only for a site that is still new: once it has anything of its own there is
 * nothing to choose, and an address typed or bookmarked goes to the pages.
 * Only for who configures the site, as the server decides too.
 */
export const Route = createFileRoute('/starter')({
  beforeLoad: async ({ context }) => {
    await requirePermission(context.queryClient, 'configureSite');
    const offer = await requireAuth(async () => {
      const site =
        await context.queryClient.ensureQueryData(siteQueryOptions());
      return context.queryClient.fetchQuery(starterOfferQueryOptions(site.id));
    });
    if (!offer.available) {
      throw redirect({ to: '/pages' });
    }
  },
  component: StarterRoute,
});

function StarterRoute() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: site } = useSuspenseQuery(siteQueryOptions());
  const { data: offer } = useQuery(starterOfferQueryOptions(site.id));
  const apply = useApplyStarter(site.id);

  const toPages = () => void navigate({ to: '/pages' });

  async function handleApply(starterId: StarterId) {
    try {
      const made = await apply.mutateAsync(starterId);
      toast(t('starters.created', { count: made.pages }), 'success');
      toPages();
    } catch {
      // Said under the options, with the choice kept: nothing was made.
    }
  }

  const error = apply.error
    ? apply.error instanceof ApiError && apply.error.status === 409
      ? t('starters.notBlank')
      : actionErrorMessage(apply.error, t('starters.error'))
    : null;

  return (
    <AuthPage
      title={t('starters.title')}
      description={t('starters.description')}
      width="md"
    >
      <StarterPicker
        fallbackLanguageName={
          offer?.fallback ? getLocaleDisplayName(site.defaultLocale) : undefined
        }
        onApply={handleApply}
        onBlank={toPages}
        error={error}
        pending={apply.isPending}
      />
    </AuthPage>
  );
}

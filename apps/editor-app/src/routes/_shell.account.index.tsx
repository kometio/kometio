import { createFileRoute } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { AccountProfileView } from '../app/account/account-profile-view';
import { accountProfileQueryOptions } from '../app/account/account-queries';
import { siteQueryOptions } from '../app/settings/site-queries';
import { requireAuth } from './-require-auth';

export const Route = createFileRoute('/_shell/account/')({
  staticData: { titleKey: 'shell.account.profile' },
  loader: ({ context }) =>
    requireAuth(() =>
      Promise.all([
        context.queryClient.ensureQueryData(accountProfileQueryOptions()),
        context.queryClient.ensureQueryData(siteQueryOptions()),
      ]),
    ),
  component: AccountRoute,
});

function AccountRoute() {
  const { data: profile } = useSuspenseQuery(accountProfileQueryOptions());
  const { data: site } = useSuspenseQuery(siteQueryOptions());

  return (
    <AccountProfileView
      // A fresh form for a different person — never one person's unsaved
      // edits carried over onto somebody else's profile.
      key={profile.id}
      profile={profile}
      locales={site.enabledLocales}
    />
  );
}

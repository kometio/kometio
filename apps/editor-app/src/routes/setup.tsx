import { useState } from 'react';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { SetupImportForm } from '../app/auth/setup-import-form';
import { SetupWizardForm } from '../app/auth/setup-wizard-form';
import { useServerFeatures } from '../app/common/deployment-queries';
import { domainOfAddress } from '../app/settings/domain-input';
import { publicSiteUrl } from '../lib/runtime-config';
import { bootstrapDeployment, fetchSetupStatus } from '../lib/setup-api-client';

/**
 * The first-run wizard. Not behind `requireAuth` — it is what creates the
 * account `requireAuth` would look for.
 *
 * The guard runs the other way round: an installation that has already
 * been set up redirects to the login page, so the route stops existing in
 * practice the moment it has done its job. The real gate is on the server
 * (POST /setup refuses once a tenant exists); this one only keeps the
 * screen from being shown pointlessly.
 */
export const Route = createFileRoute('/setup')({
  beforeLoad: async () => {
    const { hasBeenSetUp } = await fetchSetupStatus();
    if (hasBeenSetUp) {
      throw redirect({ to: '/login' });
    }
  },
  component: SetupRoute,
});

function SetupRoute() {
  const navigate = useNavigate();
  const { siteArchive } = useServerFeatures();
  const [importing, setImporting] = useState(false);

  if (importing) {
    return (
      <SetupImportForm
        // The site and its accounts are the archive's: there is nothing to sign
        // in as yet, and the login says so.
        onImported={() =>
          void navigate({ to: '/login', search: { imported: true } })
        }
        onBack={() => setImporting(false)}
      />
    );
  }

  return (
    <SetupWizardForm
      // The address this deployment was told to serve the site on: the same
      // one the editor's "View page" links use, so it is the one that is right.
      proposedDomain={domainOfAddress(publicSiteUrl())}
      // Only where the server can open an archive (docs/adr/0106).
      onChooseImport={siteArchive ? () => setImporting(true) : undefined}
      onSubmit={async (input) => {
        // The response sets the session cookie itself — see the endpoint's
        // own comment for why signing in here rather than through /login
        // is a correctness matter and not a convenience.
        await bootstrapDeployment(input);
        await navigate({ to: '/pages' });
      }}
    />
  );
}

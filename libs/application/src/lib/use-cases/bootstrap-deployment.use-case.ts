import { randomUUID } from 'node:crypto';
import { DeploymentAlreadySetUpError } from '@kometio/domain-core';
import type {
  AuthPort,
  BootstrapDeploymentResult,
  BootstrapHomePage,
  DeploymentBootstrapPort,
  Session,
  SiteImportPort,
} from '@kometio/ports';

export interface BootstrapDeploymentDeps {
  deploymentBootstrapPort: DeploymentBootstrapPort;
  authPort: AuthPort;
}

/** What was created, and the session that signs its admin in. */
export interface BootstrapDeploymentOutcome extends BootstrapDeploymentResult {
  session: Session;
}

/**
 * Whether the first-run wizard has already been completed on this deployment,
 * and, while it has not, why the site the screen was waiting for did not come
 * through (docs/adr/0106): the reason, in words fit for anybody, of the last
 * archive that was opened here and failed. It is nothing once there is a site —
 * whatever was said about an old import is old — and where no archive can be
 * opened.
 */
export async function getSetupStatus(deps: {
  deploymentBootstrapPort: Pick<DeploymentBootstrapPort, 'hasBeenSetUp'>;
  siteImport?: Pick<SiteImportPort, 'lastImportFailure'> | null;
}): Promise<{ hasBeenSetUp: boolean; importFailure: string | null }> {
  const hasBeenSetUp = await deps.deploymentBootstrapPort.hasBeenSetUp();
  const importFailure =
    hasBeenSetUp || !deps.siteImport
      ? null
      : await deps.siteImport.lastImportFailure();
  return { hasBeenSetUp, importFailure };
}

export interface BootstrapDeploymentInput {
  siteName: string;
  defaultLocale: string;
  /**
   * Where the site will be reached, already a valid hostname (the request
   * schema checks it, as it does for the password), or null to set it later.
   * The editor proposes the one the deployment was told to serve.
   */
  domain: string | null;
  adminEmail: string;
  /** Plaintext, hashed here and never stored or logged as given. */
  adminPassword: string;
}

/**
 * The first-run wizard: turns an empty, freshly deployed Kometio into one
 * somebody can log into. It is the only write in the system that runs
 * without a tenant, because it is what creates one.
 *
 * Deliberately unauthenticated, and gated on emptiness instead: there is
 * nobody to authenticate as before it runs, which is the whole point. That
 * makes "has this already been set up?" the only thing standing between an
 * open endpoint and a stranger creating themselves an admin account, so it
 * is checked here *and* again inside the port's transaction — the check
 * and the write are otherwise a race between two people who both opened
 * the wizard.
 *
 * It signs the new admin in as part of the same call, rather than sending
 * them to the login form with the credentials they typed ten seconds ago.
 * That is not a convenience: logging in separately would have to pass
 * Turnstile, whose keys are configured through the very env file this
 * wizard exists so a self-hoster does not have to edit — a fresh
 * deployment would send an empty token to a real secret key and be refused,
 * locking someone out of the installation they just created. A session
 * issued here needs no captcha to mean something: whoever completed setup
 * demonstrably controlled an unclaimed installation, a stronger proof than
 * the one login asks for.
 *
 * Password rules live at the edge (the request schema), not here, for the
 * same reason they do for invites: this use case's job is that the
 * deployment ends up in a usable state, not what counts as a good
 * password.
 */
export async function bootstrapDeployment(
  deps: BootstrapDeploymentDeps,
  input: BootstrapDeploymentInput,
): Promise<BootstrapDeploymentOutcome> {
  if (await deps.deploymentBootstrapPort.hasBeenSetUp()) {
    throw new DeploymentAlreadySetUpError();
  }

  const adminPasswordHash = await deps.authPort.hashPassword(
    input.adminPassword,
  );

  const created = await deps.deploymentBootstrapPort.bootstrap({
    siteName: input.siteName,
    defaultLocale: input.defaultLocale,
    domain: input.domain,
    adminEmail: input.adminEmail,
    adminPasswordHash,
    homePage: buildStarterHomePage(input.siteName, input.defaultLocale),
  });
  const session = await deps.authPort.createSession(
    created.userId,
    created.tenantId,
  );
  return { ...created, session };
}

/**
 * What a brand-new site looks like before anyone has edited it.
 *
 * It exists because the alternative was worse than empty: a deployment
 * that had just completed setup served a 404 on its own homepage, with
 * nothing saying the site simply had no content yet. Seeding one published
 * page is the same answer WordPress and Ghost reached, for the same
 * reason.
 *
 * Only the title is filled in, from the name the admin just typed. The
 * subtitle is deliberately left empty rather than given placeholder copy:
 * the wizard collects a locale, not a language this code has strings for,
 * so any sentence here would be wrong in most installations — whereas an
 * empty field reads as one waiting to be filled, in every language.
 */
function buildStarterHomePage(
  siteName: string,
  defaultLocale: string,
): BootstrapHomePage {
  return {
    locale: defaultLocale,
    // The slug apps/public-site resolves `/<locale>/` to (see its
    // [locale]/index.astro) — anything else would leave the site's root
    // still 404ing, which is the whole point of seeding it.
    slug: 'home',
    title: siteName,
    content: [
      {
        id: randomUUID(),
        type: 'Hero',
        props: { title: siteName, subtitle: '' },
      },
    ],
  };
}

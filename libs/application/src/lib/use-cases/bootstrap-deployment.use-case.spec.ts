import { describe, expect, it, vi } from 'vitest';
import { DeploymentAlreadySetUpError } from '@kometio/domain-core';
import type { AuthPort, DeploymentBootstrapPort } from '@kometio/ports';
import {
  bootstrapDeployment,
  getSetupStatus,
} from './bootstrap-deployment.use-case';

const INPUT = {
  siteName: 'Acme',
  defaultLocale: 'it',
  domain: null,
  adminEmail: 'admin@acme.test',
  adminPassword: 'a-long-enough-password',
};

const SESSION = {
  token: 'a-session-token',
  userId: 'u',
  tenantId: 't',
  expiresAt: new Date('2026-10-13T09:00:00Z'),
};

function deps(hasBeenSetUp: boolean) {
  const bootstrap = vi
    .fn()
    .mockResolvedValue({ tenantId: 't', siteId: 's', userId: 'u' });
  const hashPassword = vi.fn().mockResolvedValue('$argon2id$hashed');
  const createSession = vi.fn().mockResolvedValue(SESSION);
  return {
    deps: {
      deploymentBootstrapPort: {
        hasBeenSetUp: vi.fn().mockResolvedValue(hasBeenSetUp),
        bootstrap,
      } as DeploymentBootstrapPort,
      authPort: { hashPassword, createSession } as unknown as AuthPort,
    },
    bootstrap,
    hashPassword,
    createSession,
  };
}

describe('bootstrapDeployment', () => {
  it('creates the tenant, site and admin and returns their ids', async () => {
    const { deps: d, bootstrap } = deps(false);

    expect(await bootstrapDeployment(d, INPUT)).toMatchObject({
      tenantId: 't',
      siteId: 's',
      userId: 'u',
    });
    expect(bootstrap).toHaveBeenCalledTimes(1);
  });

  it('signs the new admin in, without a captcha', async () => {
    const { deps: d, createSession } = deps(false);

    const outcome = await bootstrapDeployment(d, INPUT);

    expect(createSession).toHaveBeenCalledWith('u', 't');
    expect(outcome.session).toBe(SESSION);
  });

  it('hashes the password and never passes the plaintext on', async () => {
    const { deps: d, bootstrap, hashPassword } = deps(false);

    await bootstrapDeployment(d, INPUT);

    expect(hashPassword).toHaveBeenCalledWith(INPUT.adminPassword);
    const passed = bootstrap.mock.calls[0][0];
    expect(passed.adminPasswordHash).toBe('$argon2id$hashed');
    expect(JSON.stringify(passed)).not.toContain(INPUT.adminPassword);
  });

  it('enables the default locale on the new site', async () => {
    // A site whose default locale is not among its enabled ones resolves no
    // pages at all — the wizard is the one place nobody can fix that from.
    const { deps: d, bootstrap } = deps(false);

    await bootstrapDeployment(d, INPUT);

    expect(bootstrap.mock.calls[0][0].defaultLocale).toBe('it');
  });

  it('seeds a published home page, so the new site does not 404 on itself', async () => {
    // The state this replaces: setup finished, and the site's own homepage
    // answered 404 with nothing saying it was merely empty.
    const { deps: d, bootstrap } = deps(false);

    await bootstrapDeployment(d, INPUT);

    const { homePage } = bootstrap.mock.calls[0][0];
    // 'home' specifically: it is the slug apps/public-site resolves
    // `/<locale>/` to, so any other value would leave the root still 404ing.
    expect(homePage.slug).toBe('home');
    expect(homePage.locale).toBe('it');
    expect(homePage.title).toBe('Acme');
  });

  it('puts the name the admin typed on the seeded page, and invents no copy', async () => {
    const { deps: d, bootstrap } = deps(false);

    await bootstrapDeployment(d, INPUT);

    const { content } = bootstrap.mock.calls[0][0].homePage;
    expect(content).toHaveLength(1);
    expect(content[0]).toMatchObject({
      type: 'Hero',
      props: { title: 'Acme', subtitle: '' },
    });
    // The wizard collects a locale, not a language this code has strings
    // for — an empty subtitle reads as "fill me in" everywhere, while a
    // placeholder sentence would be wrong in most installations.
    expect(content[0].id).toEqual(expect.any(String));
  });

  /*
   * The site is found by the domain it was given, so a site created without
   * one answers "not found" on every address until someone sets it by hand.
   * The wizard now proposes one, and what it was given has to reach the row.
   */
  it('hands the site its domain, so the site is reachable as soon as it exists', async () => {
    const { deps: d, bootstrap } = deps(false);

    await bootstrapDeployment(d, { ...INPUT, domain: 'acme.test' });

    expect(bootstrap.mock.calls[0][0].domain).toBe('acme.test');
  });

  it('leaves the domain empty when the admin chose to set it later', async () => {
    const { deps: d, bootstrap } = deps(false);

    await bootstrapDeployment(d, { ...INPUT, domain: null });

    expect(bootstrap.mock.calls[0][0].domain).toBeNull();
  });

  it('refuses on a deployment that already has a tenant', async () => {
    const { deps: d, bootstrap } = deps(true);

    await expect(bootstrapDeployment(d, INPUT)).rejects.toThrow(
      DeploymentAlreadySetUpError,
    );
    expect(bootstrap).not.toHaveBeenCalled();
  });

  it('does not even hash the password when already set up', async () => {
    // Cheap, but it is the difference between an endpoint a stranger can
    // make do argon2id work on demand and one that answers immediately.
    const { deps: d, hashPassword } = deps(true);

    await expect(bootstrapDeployment(d, INPUT)).rejects.toThrow();
    expect(hashPassword).not.toHaveBeenCalled();
  });
});

describe('getSetupStatus', () => {
  it.each([true, false])('says %s when the deployment says so', async (set) => {
    expect(
      await getSetupStatus({
        deploymentBootstrapPort: { hasBeenSetUp: async () => set },
      }),
    ).toEqual({ hasBeenSetUp: set, importFailure: null });
  });

  describe('when a site can be opened from an archive (docs/adr/0106)', () => {
    const failed = {
      lastImportFailure: async () => 'there is not enough room on the volume',
    };

    it('says why the last import did not come through, while there is no site', async () => {
      expect(
        await getSetupStatus({
          deploymentBootstrapPort: { hasBeenSetUp: async () => false },
          siteImport: failed,
        }),
      ).toEqual({
        hasBeenSetUp: false,
        importFailure: 'there is not enough room on the volume',
      });
    });

    it('says nothing of it once there is a site, and does not even ask', async () => {
      const lastImportFailure = vi.fn().mockResolvedValue('old news');

      expect(
        await getSetupStatus({
          deploymentBootstrapPort: { hasBeenSetUp: async () => true },
          siteImport: { lastImportFailure },
        }),
      ).toEqual({ hasBeenSetUp: true, importFailure: null });
      expect(lastImportFailure).not.toHaveBeenCalled();
    });

    it('says nothing where no archive can be opened', async () => {
      expect(
        await getSetupStatus({
          deploymentBootstrapPort: { hasBeenSetUp: async () => false },
          siteImport: null,
        }),
      ).toEqual({ hasBeenSetUp: false, importFailure: null });
    });
  });
});

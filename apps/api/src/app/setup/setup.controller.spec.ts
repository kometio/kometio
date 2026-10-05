import { UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import type {
  AuthPort,
  DeploymentBootstrapPort,
  SiteImportPort,
} from '@kometio/ports';
import {
  DeploymentAlreadySetUpError,
  SiteArchiveUnavailableError,
} from '@kometio/domain-core';
import { Readable } from 'node:stream';
import type { DeploymentTenantResolver } from '../deployment-tenant.resolver';
import { testApiEnv } from '../../test/api-env.test-fixture';
import { SessionCookies } from '../auth/session-cookies';
import { SetupController } from './setup.controller';
import type { BootstrapDeploymentBody } from './setup.schemas';
import type { SetupTokenRegistry } from './setup-token.registry';

const VALID_BODY: BootstrapDeploymentBody = {
  setupToken: 'the-real-token',
  siteName: 'Pasticceria Rossi',
  defaultLocale: 'it',
  domain: null,
  adminEmail: 'anna@example.test',
  adminPassword: 'a-long-enough-password',
};

describe('SetupController (unit)', () => {
  let deploymentBootstrapPort: jest.Mocked<DeploymentBootstrapPort>;
  let authPort: jest.Mocked<Pick<AuthPort, 'hashPassword' | 'createSession'>>;
  let tenant: jest.Mocked<Pick<DeploymentTenantResolver, 'refresh'>>;
  let setupToken: jest.Mocked<Pick<SetupTokenRegistry, 'verify' | 'clear'>>;
  let response: jest.Mocked<Pick<Response, 'cookie'>>;
  let controller: SetupController;

  beforeEach(() => {
    deploymentBootstrapPort = {
      hasBeenSetUp: jest.fn().mockResolvedValue(false),
      bootstrap: jest
        .fn()
        .mockResolvedValue({ tenantId: 't', siteId: 's', userId: 'u' }),
    };
    authPort = {
      hashPassword: jest.fn().mockResolvedValue('$argon2id$hashed'),
      createSession: jest
        .fn()
        .mockResolvedValue({ token: 'session-token', userId: 'u' }),
    };
    tenant = { refresh: jest.fn() };
    setupToken = { verify: jest.fn().mockReturnValue(true), clear: jest.fn() };
    response = { cookie: jest.fn() };

    controller = new SetupController(
      {
        deploymentBootstrapPort,
        authPort: authPort as unknown as AuthPort,
        tenant: tenant as unknown as DeploymentTenantResolver,
        siteImport: null,
      },
      setupToken as unknown as SetupTokenRegistry,
      new SessionCookies(testApiEnv()),
    );
  });

  function bootstrap(body = VALID_BODY) {
    return controller.bootstrap(body, response as unknown as Response);
  }

  it('creates the deployment and issues a session when the token is right', async () => {
    expect(await bootstrap()).toEqual({
      tenantId: 't',
      siteId: 's',
      userId: 'u',
    });
    expect(setupToken.verify).toHaveBeenCalledWith('the-real-token');
    expect(response.cookie).toHaveBeenCalled();
  });

  it('creates the site on the address it was given, so it is reachable at once', async () => {
    await bootstrap({ ...VALID_BODY, domain: 'pasticceria.test' });

    expect(deploymentBootstrapPort.bootstrap).toHaveBeenCalledWith(
      expect.objectContaining({ domain: 'pasticceria.test' }),
    );
  });

  it('creates the site with no address when the admin chose to set it later', async () => {
    await bootstrap();

    expect(deploymentBootstrapPort.bootstrap).toHaveBeenCalledWith(
      expect.objectContaining({ domain: null }),
    );
  });

  it('rejects a wrong token with a 401', async () => {
    setupToken.verify.mockReturnValue(false);

    await expect(bootstrap()).rejects.toThrow(UnauthorizedException);
  });

  // The whole point of the gate: a rejected caller must not reach the
  // write. Asserting the rejection alone would still pass if the token
  // were checked after bootstrapping.
  it('writes nothing at all when the token is wrong', async () => {
    setupToken.verify.mockReturnValue(false);

    await expect(bootstrap()).rejects.toThrow();

    expect(deploymentBootstrapPort.bootstrap).not.toHaveBeenCalled();
    expect(authPort.createSession).not.toHaveBeenCalled();
    expect(response.cookie).not.toHaveBeenCalled();
    expect(tenant.refresh).not.toHaveBeenCalled();
  });

  // Argon2 is deliberately slow. Hashing before checking the token would
  // turn an endpoint anyone can reach into a way to burn the server's CPU
  // on demand.
  it('does not even hash the password when the token is wrong', async () => {
    setupToken.verify.mockReturnValue(false);

    await expect(bootstrap()).rejects.toThrow();

    expect(authPort.hashPassword).not.toHaveBeenCalled();
  });

  it('spends the token once setup has succeeded', async () => {
    await bootstrap();

    expect(setupToken.clear).toHaveBeenCalledTimes(1);
  });

  it('does not spend the token when setup failed', async () => {
    setupToken.verify.mockReturnValue(false);

    await expect(bootstrap()).rejects.toThrow();

    expect(setupToken.clear).not.toHaveBeenCalled();
  });

  it('reports whether the deployment has been set up', async () => {
    deploymentBootstrapPort.hasBeenSetUp.mockResolvedValue(true);

    expect(await controller.status()).toEqual({
      hasBeenSetUp: true,
      importFailure: null,
    });
  });

  describe('a site opened from an archive (docs/adr/0106)', () => {
    let siteImport: jest.Mocked<SiteImportPort>;
    const upload = Readable.from([Buffer.from('the archive, as it arrives')]);

    beforeEach(() => {
      siteImport = {
        import: jest.fn().mockResolvedValue(undefined),
        lastImportFailure: jest.fn().mockResolvedValue(null),
      };
      controller = new SetupController(
        {
          deploymentBootstrapPort,
          authPort: authPort as unknown as AuthPort,
          tenant: tenant as unknown as DeploymentTenantResolver,
          siteImport,
        },
        setupToken as unknown as SetupTokenRegistry,
        new SessionCookies(testApiEnv()),
      );
    });

    it('hands the archive over as it arrives, and says it is accepted', async () => {
      expect(await controller.importSite('the-real-token', upload)).toEqual({
        accepted: true,
      });

      expect(setupToken.verify).toHaveBeenCalledWith('the-real-token');
      expect(siteImport.import).toHaveBeenCalledWith(upload);
    });

    // The point of the gate: nothing of an archive is read for somebody who
    // cannot read this server's log.
    it('reads none of it when the token is wrong or missing', async () => {
      setupToken.verify.mockReturnValue(false);

      await expect(controller.importSite('wrong', upload)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(controller.importSite(undefined, upload)).rejects.toThrow(
        UnauthorizedException,
      );

      expect(siteImport.import).not.toHaveBeenCalled();
    });

    it('refuses a deployment that already has a site, before reading any of it', async () => {
      deploymentBootstrapPort.hasBeenSetUp.mockResolvedValue(true);

      await expect(
        controller.importSite('the-real-token', upload),
      ).rejects.toBeInstanceOf(DeploymentAlreadySetUpError);

      expect(siteImport.import).not.toHaveBeenCalled();
    });

    it('says there is no such thing where nobody can open an archive', async () => {
      const without = new SetupController(
        {
          deploymentBootstrapPort,
          authPort: authPort as unknown as AuthPort,
          tenant: tenant as unknown as DeploymentTenantResolver,
          siteImport: null,
        },
        setupToken as unknown as SetupTokenRegistry,
        new SessionCookies(testApiEnv()),
      );

      await expect(
        without.importSite('the-real-token', upload),
      ).rejects.toBeInstanceOf(SiteArchiveUnavailableError);
    });

    it('does not spend the token: a failed import is tried again with the same one', async () => {
      await controller.importSite('the-real-token', upload);

      expect(setupToken.clear).not.toHaveBeenCalled();
    });

    it('says why the last import failed, while there is no site', async () => {
      siteImport.lastImportFailure.mockResolvedValue(
        'there is not enough room on the volume',
      );

      expect(await controller.status()).toEqual({
        hasBeenSetUp: false,
        importFailure: 'there is not enough room on the volume',
      });
    });

    it('says nothing of it once there is a site: whatever the file says is old', async () => {
      deploymentBootstrapPort.hasBeenSetUp.mockResolvedValue(true);
      siteImport.lastImportFailure.mockResolvedValue('old news');

      expect(await controller.status()).toEqual({
        hasBeenSetUp: true,
        importFailure: null,
      });
      expect(siteImport.lastImportFailure).not.toHaveBeenCalled();
    });
  });
});

import { UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthPort, DeploymentBootstrapPort } from '@kometio/ports';
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

    expect(await controller.status()).toEqual({ hasBeenSetUp: true });
  });
});

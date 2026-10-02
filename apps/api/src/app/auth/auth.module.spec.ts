import { Test } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthModule } from './auth.module';

// Not an integration test: SessionAuthAdapter/DrizzleUserRepository's
// DATABASE dependency constructs a postgres.js client, which connects
// lazily — compiling the module never opens a socket (see
// libs/adapters/postgres-db/src/lib/client.spec.ts for that same guarantee
// at the source).
describe('AuthModule', () => {
  const originalValue = process.env.DEFAULT_TENANT_ID;

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env.DEFAULT_TENANT_ID;
    } else {
      process.env.DEFAULT_TENANT_ID = originalValue;
    }
  });

  it('wires up the module graph and resolves AuthController', async () => {
    process.env.DEFAULT_TENANT_ID = '6f1c2a4e-8b3d-4c5e-9f70-1a2b3c4d5e6f';

    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
    }).compile();

    expect(moduleRef.get(AuthController)).toBeInstanceOf(AuthController);
  });

  it('builds without DEFAULT_TENANT_ID, for a deployment not set up yet', async () => {
    // It used to fail fast here, which was right while the tenant id could
    // only ever come from the environment. Since the first-run wizard it
    // cannot: a self-hoster who has never completed setup has no tenant to
    // name, and the API still has to boot far enough to serve the wizard
    // itself. DeploymentTenantResolver takes over, falling back to the
    // single row in `tenants` — see its own tests for that behaviour.
    delete process.env.DEFAULT_TENANT_ID;

    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
    }).compile();

    expect(moduleRef.get(AuthController)).toBeInstanceOf(AuthController);
  });
});

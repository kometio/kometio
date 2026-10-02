import { Test } from '@nestjs/testing';
import { HealthController } from './health/health.controller';
import { AppModule } from './app.module';

// Not an integration test: PagesModule's DATABASE provider constructs a
// postgres.js client, which connects lazily — compiling the module never
// opens a socket, so no live Postgres is needed here (see
// libs/adapters/postgres-db/src/lib/client.spec.ts for that same guarantee
// at the source).
describe('AppModule', () => {
  it('wires up the module graph and resolves its controllers', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(moduleRef.get(HealthController)).toBeInstanceOf(HealthController);
  });
});

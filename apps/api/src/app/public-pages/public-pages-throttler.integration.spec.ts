import { Controller, Get, Module, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  PUBLIC_API_SERVICE_TOKEN_HEADER,
  PUBLIC_API_VISITOR_IP_HEADER,
} from '@kometio/api-contracts';
import { ApiEnvModule } from '../api-env.module';
import { PublicPagesThrottlerGuard } from './public-pages-throttler.guard';

/**
 * The behaviour the guard exists for, end to end through Nest's real
 * throttler rather than through its own `getTracker` in isolation: two
 * visitors arriving through the same server must spend from two different
 * buckets. Before this guard they shared one, and a site busy enough to
 * exhaust it answered 500 to everybody at once.
 *
 * A limit of 3 rather than the real 120 — the point is where the wall is,
 * not how far away.
 */
const LIMIT = 3;
const SERVICE_TOKEN = 'a-real-deployment-secret-of-some-length';

@Controller('pages')
class ProbeController {
  @Get('tree')
  tree() {
    return { ok: true };
  }
}

@Module({
  imports: [
    ApiEnvModule,
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60000, limit: LIMIT }] }),
  ],
  controllers: [ProbeController],
  providers: [{ provide: APP_GUARD, useClass: PublicPagesThrottlerGuard }],
})
class ProbeModule {}

describe('PublicPagesThrottlerGuard (through the real throttler)', () => {
  let app: INestApplication;
  const original = process.env['PUBLIC_API_SERVICE_TOKEN'];

  beforeAll(async () => {
    process.env['PUBLIC_API_SERVICE_TOKEN'] = SERVICE_TOKEN;
    const moduleRef = await Test.createTestingModule({
      imports: [ProbeModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (original === undefined) delete process.env['PUBLIC_API_SERVICE_TOKEN'];
    else process.env['PUBLIC_API_SERVICE_TOKEN'] = original;
  });

  function pageView(visitorIp: string, token = SERVICE_TOKEN) {
    return request(app.getHttpServer())
      .get('/pages/tree')
      .set(PUBLIC_API_SERVICE_TOKEN_HEADER, token)
      .set(PUBLIC_API_VISITOR_IP_HEADER, visitorIp);
  }

  it('gives each visitor their own budget, not one shared by the whole site', async () => {
    for (let i = 0; i < LIMIT; i++) {
      await pageView('203.0.113.7').expect(200);
    }
    // The first visitor has spent theirs...
    await pageView('203.0.113.7').expect(429);
    // ...and it costs the next visitor nothing, which is the whole point.
    await pageView('198.51.100.4').expect(200);
  });

  it('does not let an unvouched caller pick its own bucket', async () => {
    const forged = () =>
      request(app.getHttpServer())
        .get('/pages/tree')
        .set(PUBLIC_API_VISITOR_IP_HEADER, `10.0.0.${Math.random()}`);
    // Every request claims a fresh address; without the token they all
    // land in the caller's own bucket and the limit still bites.
    const statuses: number[] = [];
    for (let i = 0; i < LIMIT + 2; i++) {
      statuses.push((await forged()).status);
    }
    expect(statuses).toContain(429);
  });
});

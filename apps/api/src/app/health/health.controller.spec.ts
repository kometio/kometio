import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { DatabaseHealthPort } from '@kometio/ports';
import request from 'supertest';
import { DATABASE_HEALTH } from '../adapters/port.tokens';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let app: INestApplication;

  async function createApp(database: DatabaseHealthPort) {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: DATABASE_HEALTH, useValue: database }],
    }).compile();

    const nestApp = moduleRef.createNestApplication();
    await nestApp.init();
    return nestApp;
  }

  afterEach(async () => {
    await app.close();
  });

  it('returns ok when the database round-trip succeeds', async () => {
    app = await createApp({ ping: () => Promise.resolve() });

    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('returns 503 when the database is unreachable', async () => {
    app = await createApp({
      ping: () => Promise.reject(new Error('connection refused')),
    });

    await request(app.getHttpServer()).get('/health').expect(503);
  });
});

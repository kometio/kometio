import { randomUUID } from 'node:crypto';
import { type INestApplication, type ModuleMetadata } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { AuthPort } from '@kometio/ports';
import { type KometioDb } from '@kometio/postgres-db';
import {
  createIntegrationSite,
  createIntegrationUser,
  deleteIntegrationFixtures,
  type IntegrationSiteValues,
  type IntegrationUserValues,
} from '@kometio/postgres-db/testing';
import { DATABASE } from '../app/database.module';
import { HttpExceptionFilter } from '../app/http-exception.filter';
import { requestIdMiddleware } from '../app/request-id.middleware';
import { trustProxyHops } from '../app/trusted-proxy';
import { rejectCrossSiteWrites } from '../app/cross-site-writes.middleware';
import { requireEnv } from '@kometio/env-config';
import { AUTH_PORT } from '../app/adapters/port.tokens';

export interface IntegrationAppOptions {
  imports: NonNullable<ModuleMetadata['imports']>;
  /** Swaps providers before compiling — a fake captcha, a recording port. */
  overrideProviders?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
  /** Runs after the shared middleware and before `init()`. */
  beforeInit?: (app: INestApplication) => void;
  /** Reverse proxies trusted in front of the app, as TRUSTED_PROXY_HOPS in production. */
  trustedProxyHops?: number;
}

/** A user whose password is known, so a spec can log in as them. */
export interface IntegrationUser {
  id: string;
  email: string;
  password: string;
}

/**
 * The Nest app a controller integration spec talks to, against the real
 * database. The middleware and error filter are the ones main.ts installs,
 * so a response has the shape a client really gets.
 *
 * Every row lives under DEFAULT_TENANT_ID, the tenant `/auth/login`
 * resolves, and that tenant cannot be deleted. So the app remembers each
 * site and user it creates and `close()` deletes exactly those. A user a
 * test creates through the API instead (an invitation) is passed to
 * `trackUser`, or it outlives the run.
 */
export class IntegrationApp {
  private readonly siteIds: string[] = [];
  private readonly userIds: string[] = [];

  private constructor(
    readonly app: INestApplication,
    readonly db: KometioDb,
    readonly tenantId: string,
  ) {}

  static async start(options: IntegrationAppOptions): Promise<IntegrationApp> {
    const tenantId = process.env.DEFAULT_TENANT_ID;
    if (!tenantId) {
      throw new Error(
        'DEFAULT_TENANT_ID is not set: integration specs read it from .env (see docs/development.md)',
      );
    }
    const builder = Test.createTestingModule({ imports: options.imports });
    const moduleRef = await (
      options.overrideProviders?.(builder) ?? builder
    ).compile();

    const app = moduleRef.createNestApplication();
    trustProxyHops(app, options.trustedProxyHops ?? 0);
    app.use(cookieParser());
    app.use(rejectCrossSiteWrites(requireEnv('EDITOR_APP_URL')));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.use(requestIdMiddleware);
    options.beforeInit?.(app);
    /*
     * `listen(0)` rather than `init()`: supertest, handed a server that is
     * not listening, opens an ephemeral listener per request and closes it
     * afterwards, while `request.agent` keeps its connections alive between
     * requests. A reused connection whose listener has just closed fails the
     * request with `socket hang up` — roughly one run in five, always a
     * single test, never the same one twice.
     */
    await app.listen(0);
    return new IntegrationApp(app, app.get<KometioDb>(DATABASE), tenantId);
  }

  async createSite(values: IntegrationSiteValues = {}): Promise<string> {
    const siteId = await createIntegrationSite(this.db, this.tenantId, values);
    this.siteIds.push(siteId);
    return siteId;
  }

  /** An admin unless `role` says otherwise, with a password hashed by the app's own AuthPort. */
  async createUser(
    values: Omit<IntegrationUserValues, 'passwordHash'> = {},
  ): Promise<IntegrationUser> {
    const password = randomUUID();
    const passwordHash = await this.app
      .get<AuthPort>(AUTH_PORT)
      .hashPassword(password);
    const email = values.email ?? `integration-${randomUUID()}@example.test`;
    const id = await createIntegrationUser(this.db, this.tenantId, {
      ...values,
      email,
      passwordHash,
    });
    this.userIds.push(id);
    return { id, email, password };
  }

  /** An agent that keeps the session cookie across requests. */
  async login(
    user: IntegrationUser,
  ): Promise<ReturnType<typeof request.agent>> {
    const agent = request.agent(this.app.getHttpServer());
    await agent
      .post('/auth/login')
      .send({
        email: user.email,
        password: user.password,
        captchaToken: 'test-token',
      })
      .expect(200);
    return agent;
  }

  trackUser(userId: string): void {
    this.userIds.push(userId);
  }

  async close(): Promise<void> {
    await deleteIntegrationFixtures(this.db, this.tenantId, {
      siteIds: this.siteIds,
      userIds: this.userIds,
    });
    await this.app.close();
    await this.db.$client.end();
  }
}

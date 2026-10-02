import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type KometioDb, createAppDb } from '@kometio/postgres-db';
import {
  createIntegrationSite,
  createIntegrationTenant,
  deleteIntegrationTenants,
} from '@kometio/postgres-db/testing';
import { DrizzleSiteAiSettingsRepository } from './drizzle-site-ai-settings.repository';

/** Runs against a real Postgres — see docs/development.md. */
describe('DrizzleSiteAiSettingsRepository (integration)', () => {
  let db: KometioDb;
  let repository: DrizzleSiteAiSettingsRepository;
  let tenantA: string;
  let tenantB: string;
  let siteA: string;

  const settings = {
    provider: 'anthropic' as const,
    model: 'claude-opus-5',
    baseUrl: null,
    apiKeySealed: 'v1.keyid.iv.tag.ciphertext',
    apiKeyHint: 'x9Qz',
  };

  beforeAll(async () => {
    db = createAppDb();
    repository = new DrizzleSiteAiSettingsRepository(db);
    tenantA = await createIntegrationTenant(db, 'Integration Tenant A');
    tenantB = await createIntegrationTenant(db, 'Integration Tenant B');
    siteA = await createIntegrationSite(db, tenantA);
  });

  afterAll(async () => {
    await deleteIntegrationTenants(db, [tenantA, tenantB]);
    await db.$client.end();
  });

  it('has nothing for a site never configured', async () => {
    expect(await repository.get(tenantA, siteA)).toBeNull();
  });

  it('saves, replaces and deletes the settings of a site', async () => {
    await repository.save(tenantA, siteA, settings);
    expect(await repository.get(tenantA, siteA)).toMatchObject(settings);

    const local = {
      provider: 'openai-compatible' as const,
      model: 'qwen3:14b',
      baseUrl: 'http://localhost:11434/v1',
      apiKeySealed: null,
      apiKeyHint: null,
    };
    await repository.save(tenantA, siteA, local);
    const replaced = await repository.get(tenantA, siteA);
    expect(replaced).toMatchObject(local);
    expect(replaced?.updatedAt).toBeInstanceOf(Date);

    await repository.delete(tenantA, siteA);
    expect(await repository.get(tenantA, siteA)).toBeNull();
  });

  it("never shows one tenant another tenant's settings", async () => {
    await repository.save(tenantA, siteA, settings);

    expect(await repository.get(tenantB, siteA)).toBeNull();
    await repository.delete(tenantB, siteA);
    expect(await repository.get(tenantA, siteA)).toMatchObject(settings);
  });
});

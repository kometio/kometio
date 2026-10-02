import { and, eq } from 'drizzle-orm';
import type {
  SiteAiSettingsRepositoryPort,
  StoredSiteAiSettings,
} from '@kometio/ports';
import {
  type KometioDb,
  siteAiSettings,
  withTenant,
} from '@kometio/postgres-db';

export class DrizzleSiteAiSettingsRepository implements SiteAiSettingsRepositoryPort {
  constructor(private readonly db: KometioDb) {}

  async get(
    tenantId: string,
    siteId: string,
  ): Promise<StoredSiteAiSettings | null> {
    const [row] = await withTenant(this.db, tenantId, (tx) =>
      tx
        .select()
        .from(siteAiSettings)
        .where(
          and(
            eq(siteAiSettings.tenantId, tenantId),
            eq(siteAiSettings.siteId, siteId),
          ),
        )
        .limit(1),
    );
    if (!row) return null;
    return {
      provider: row.provider,
      model: row.model,
      baseUrl: row.baseUrl,
      apiKeySealed: row.apiKeySealed,
      apiKeyHint: row.apiKeyHint,
      updatedAt: row.updatedAt,
    };
  }

  async save(
    tenantId: string,
    siteId: string,
    settings: Omit<StoredSiteAiSettings, 'updatedAt'>,
  ): Promise<void> {
    const values = { ...settings, updatedAt: new Date() };
    await withTenant(this.db, tenantId, (tx) =>
      tx
        .insert(siteAiSettings)
        .values({ tenantId, siteId, ...values })
        .onConflictDoUpdate({ target: siteAiSettings.siteId, set: values }),
    );
  }

  async delete(tenantId: string, siteId: string): Promise<void> {
    await withTenant(this.db, tenantId, (tx) =>
      tx
        .delete(siteAiSettings)
        .where(
          and(
            eq(siteAiSettings.tenantId, tenantId),
            eq(siteAiSettings.siteId, siteId),
          ),
        ),
    );
  }
}

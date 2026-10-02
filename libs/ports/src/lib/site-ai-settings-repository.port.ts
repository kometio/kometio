import type { PageGeneratorProvider } from '@kometio/shared-types';

/**
 * A site's page generation settings as stored: the API key SEALED, as
 * SecretCipherPort left it. Nothing here is ever the key in the clear.
 */
export interface StoredSiteAiSettings {
  provider: PageGeneratorProvider;
  model: string;
  baseUrl: string | null;
  apiKeySealed: string | null;
  apiKeyHint: string | null;
  updatedAt: Date;
}

/**
 * A port of its own, not a method of SiteRepositoryPort: the site's row
 * is read in many places and this, holding a secret, is read by the page
 * generator and the settings screen only.
 */
export interface SiteAiSettingsRepositoryPort {
  get(tenantId: string, siteId: string): Promise<StoredSiteAiSettings | null>;
  save(
    tenantId: string,
    siteId: string,
    settings: Omit<StoredSiteAiSettings, 'updatedAt'>,
  ): Promise<void>;
  delete(tenantId: string, siteId: string): Promise<void>;
}

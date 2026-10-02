import { SiteAiSettingsRejectedError } from '@kometio/domain-core';
import type {
  SecretCipherPort,
  SiteAiSettingsRepositoryPort,
  SiteRepositoryPort,
} from '@kometio/ports';
import type {
  SiteAiSettingsInput,
  SiteAiSettingsView,
} from '@kometio/api-contracts';
import { requireSite } from './require-site';

export interface SiteAiSettingsDeps {
  siteRepository: SiteRepositoryPort;
  aiSettingsRepository: SiteAiSettingsRepositoryPort;
  cipher: SecretCipherPort;
}

const NOT_CONFIGURED: SiteAiSettingsView = {
  configured: false,
  provider: null,
  model: null,
  baseUrl: null,
  apiKeyHint: null,
};

/** What the settings screen shows: never the key, only its last four characters. */
export async function getSiteAiSettings(
  deps: Pick<SiteAiSettingsDeps, 'aiSettingsRepository'>,
  input: { tenantId: string; siteId: string },
): Promise<SiteAiSettingsView> {
  const stored = await deps.aiSettingsRepository.get(
    input.tenantId,
    input.siteId,
  );
  if (!stored) return NOT_CONFIGURED;
  return {
    configured: true,
    provider: stored.provider,
    model: stored.model,
    baseUrl: stored.baseUrl,
    apiKeyHint: stored.apiKeyHint,
  };
}

/**
 * Saves how a site generates pages. The key is sealed before it is stored;
 * absent, the stored one is kept; `null` removes it. Claude cannot be
 * reached without one, so it is refused there — a local OpenAI-compatible
 * server may need none.
 *
 * The site is looked up first, inside the tenant: a foreign key does not
 * apply row-level security, so a site id from another tenant would
 * otherwise be accepted.
 */
export async function updateSiteAiSettings(
  deps: SiteAiSettingsDeps,
  input: { tenantId: string; siteId: string; settings: SiteAiSettingsInput },
): Promise<SiteAiSettingsView> {
  await requireSite(deps.siteRepository, input.tenantId, input.siteId);
  const { settings } = input;
  const stored = await deps.aiSettingsRepository.get(
    input.tenantId,
    input.siteId,
  );

  const baseUrl = addressOf(settings);
  const key = keyToStore(stored, settings, baseUrl, deps.cipher);
  if (settings.provider === 'anthropic' && key.sealed === null) {
    throw new SiteAiSettingsRejectedError('api-key-required');
  }

  await deps.aiSettingsRepository.save(input.tenantId, input.siteId, {
    provider: settings.provider,
    model: settings.model,
    baseUrl,
    apiKeySealed: key.sealed,
    apiKeyHint: key.hint,
  });
  return getSiteAiSettings(deps, input);
}

/** Claude has one address, its own; any other provider is where the admin says. */
function addressOf(settings: SiteAiSettingsInput): string | null {
  return settings.provider === 'anthropic' ? null : settings.baseUrl;
}

type StoredSettings = Awaited<ReturnType<SiteAiSettingsRepositoryPort['get']>>;

/**
 * The key as it will be stored: the one just typed, sealed; none, when it
 * was removed; or the stored one, kept — but only for the server it was
 * typed in for. Kept for a new address, it would be sent there on the
 * next generation: an admin who never saw the key could have it
 * delivered to a server of their own.
 */
function keyToStore(
  stored: StoredSettings,
  settings: SiteAiSettingsInput,
  baseUrl: string | null,
  cipher: SecretCipherPort,
): { sealed: string | null; hint: string | null } {
  if (settings.apiKey === null) return { sealed: null, hint: null };
  if (settings.apiKey !== undefined) {
    return {
      sealed: cipher.seal(settings.apiKey),
      hint: keyHint(settings.apiKey),
    };
  }
  if (!stored || stored.apiKeySealed === null) {
    return { sealed: null, hint: stored?.apiKeyHint ?? null };
  }
  const sameServer =
    stored.provider === settings.provider && stored.baseUrl === baseUrl;
  if (!sameServer) {
    throw new SiteAiSettingsRejectedError('api-key-for-new-server');
  }
  return { sealed: stored.apiKeySealed, hint: stored.apiKeyHint };
}

/** Keys this short show nothing: four characters of one are most of it. */
const SHORTEST_KEY_WITH_HINT = 16;

/** The last four characters of a key, or `''` for one too short to show any of. */
function keyHint(apiKey: string): string {
  return apiKey.length >= SHORTEST_KEY_WITH_HINT ? apiKey.slice(-4) : '';
}

export async function removeSiteAiSettings(
  deps: Pick<SiteAiSettingsDeps, 'aiSettingsRepository'>,
  input: { tenantId: string; siteId: string },
): Promise<void> {
  await deps.aiSettingsRepository.delete(input.tenantId, input.siteId);
}

import {
  SiteAiSettingsRejectedError,
  SiteNotFoundError,
} from '@kometio/domain-core';
import {
  buildSite,
  FakeSecretCipher,
  InMemorySiteAiSettingsRepository,
  InMemorySiteRepository,
} from '@kometio/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getSiteAiSettings,
  removeSiteAiSettings,
  updateSiteAiSettings,
  type SiteAiSettingsDeps,
} from './site-ai-settings.use-cases';

const at = { tenantId: 'tenant-1', siteId: 'site-1' };
const claude = {
  provider: 'anthropic' as const,
  model: 'claude-opus-5',
  baseUrl: null,
  apiKey: 'sk-ant-an-invented-key-Q7x2',
};

describe('site AI settings', () => {
  let deps: SiteAiSettingsDeps;
  let aiSettings: InMemorySiteAiSettingsRepository;

  beforeEach(async () => {
    const sites = new InMemorySiteRepository();
    await sites.add(buildSite());
    aiSettings = new InMemorySiteAiSettingsRepository();
    deps = {
      siteRepository: sites,
      aiSettingsRepository: aiSettings,
      cipher: new FakeSecretCipher(),
    };
  });

  it('says a site is not configured until it is', async () => {
    expect(await getSiteAiSettings(deps, at)).toEqual({
      configured: false,
      provider: null,
      model: null,
      baseUrl: null,
      apiKeyHint: null,
    });
  });

  it('stores the key sealed and shows only its last four characters', async () => {
    const view = await updateSiteAiSettings(deps, { ...at, settings: claude });

    expect(view).toEqual({
      configured: true,
      provider: 'anthropic',
      model: 'claude-opus-5',
      baseUrl: null,
      apiKeyHint: 'Q7x2',
    });
    const stored = await aiSettings.get(at.tenantId, at.siteId);
    expect(stored?.apiKeySealed).not.toContain(claude.apiKey);
    expect(JSON.stringify(view)).not.toContain(claude.apiKey);
  });

  it('shows nothing of a key too short to show a part of', async () => {
    const view = await updateSiteAiSettings(deps, {
      ...at,
      settings: {
        provider: 'openai-compatible',
        model: 'qwen3:14b',
        baseUrl: 'http://localhost:11434/v1',
        apiKey: 'abc12345',
      },
    });

    expect(view.apiKeyHint).toBe('');
  });

  it('keeps the stored key when none is sent, and removes it on null', async () => {
    await updateSiteAiSettings(deps, { ...at, settings: claude });

    const kept = await updateSiteAiSettings(deps, {
      ...at,
      settings: { ...claude, model: 'claude-sonnet-5', apiKey: undefined },
    });
    expect(kept).toMatchObject({
      model: 'claude-sonnet-5',
      apiKeyHint: 'Q7x2',
    });

    const local = await updateSiteAiSettings(deps, {
      ...at,
      settings: {
        provider: 'openai-compatible',
        model: 'qwen3:14b',
        baseUrl: 'http://localhost:11434/v1',
        apiKey: null,
      },
    });
    expect(local).toMatchObject({
      apiKeyHint: null,
      baseUrl: 'http://localhost:11434/v1',
    });
  });

  it('never sends a stored key to a server it was not typed in for', async () => {
    const openai = {
      provider: 'openai-compatible' as const,
      model: 'gpt-5',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-an-invented-openai-key-R4t8',
    };
    await updateSiteAiSettings(deps, { ...at, settings: openai });

    for (const moved of [
      { ...openai, baseUrl: 'https://collector.example.com/v1' },
      { ...claude },
    ]) {
      await expect(
        updateSiteAiSettings(deps, {
          ...at,
          settings: { ...moved, apiKey: undefined },
        }),
      ).rejects.toMatchObject({ reason: 'api-key-for-new-server' });
    }
    expect(await getSiteAiSettings(deps, at)).toMatchObject({
      baseUrl: 'https://api.openai.com/v1',
      apiKeyHint: 'R4t8',
    });

    // With its own key, the new server is fine.
    const moved = await updateSiteAiSettings(deps, {
      ...at,
      settings: {
        ...openai,
        baseUrl: 'https://other.example.com/v1',
        apiKey: 'sk-another-invented-key-P2w6',
      },
    });
    expect(moved.apiKeyHint).toBe('P2w6');
  });

  it('refuses Claude without a key, stored or new', async () => {
    await expect(
      updateSiteAiSettings(deps, {
        ...at,
        settings: { ...claude, apiKey: undefined },
      }),
    ).rejects.toBeInstanceOf(SiteAiSettingsRejectedError);
  });

  it("refuses a site that is not the tenant's own", async () => {
    await expect(
      updateSiteAiSettings(deps, {
        tenantId: 'tenant-2',
        siteId: 'site-1',
        settings: claude,
      }),
    ).rejects.toBeInstanceOf(SiteNotFoundError);
    expect(await aiSettings.get('tenant-2', 'site-1')).toBeNull();
  });

  it('forgets the settings on removal', async () => {
    await updateSiteAiSettings(deps, { ...at, settings: claude });
    await removeSiteAiSettings(deps, at);
    expect((await getSiteAiSettings(deps, at)).configured).toBe(false);
  });
});

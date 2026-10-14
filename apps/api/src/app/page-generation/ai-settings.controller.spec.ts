import { PageGenerationDisabledError } from '@kometio/domain-core';
import {
  buildSite,
  FakeSecretCipher,
  InMemoryAuditLog,
  InMemorySiteAiSettingsRepository,
  InMemorySiteRepository,
} from '@kometio/testing';
import { AuditRecorder } from '../audit/audit-recorder';
import { AiSettingsController } from './ai-settings.controller';
import { GenerationSlots } from './generation-slots';
import { PageGenerationDeps } from './page-generation.deps';

async function controller(
  cipher: FakeSecretCipher | null,
  auditLog = new InMemoryAuditLog(),
) {
  const sites = new InMemorySiteRepository();
  await sites.add(buildSite());
  return new AiSettingsController(
    new PageGenerationDeps({
      siteRepository: sites,
      aiSettingsRepository: new InMemorySiteAiSettingsRepository(),
      generation: cipher && {
        cipher,
        createGenerator: () => {
          throw new Error('never called');
        },
      },
      slots: new GenerationSlots(2),
      deadlineMs: 60_000,
    }),
    new AuditRecorder(auditLog),
  );
}

const key = 'sk-ant-an-invented-key-Z9k4';

describe('AiSettingsController', () => {
  it('takes the key and never gives it back', async () => {
    const ai = await controller(new FakeSecretCipher());

    const saved = await ai.update('tenant-1', 'admin-1', 'site-1', {
      provider: 'anthropic',
      model: 'claude-opus-5',
      baseUrl: null,
      apiKey: key,
    });
    const read = await ai.get('tenant-1', 'site-1');

    expect(read).toMatchObject({
      enabled: true,
      configured: true,
      apiKeyHint: 'Z9k4',
    });
    expect(JSON.stringify([saved, read])).not.toContain(key);
  });

  it('says page generation is off when the deployment has no secrets key', async () => {
    const ai = await controller(null);

    expect(await ai.get('tenant-1', 'site-1')).toMatchObject({
      enabled: false,
      configured: false,
    });
    await expect(
      ai.update('tenant-1', 'admin-1', 'site-1', {
        provider: 'anthropic',
        model: 'claude-opus-5',
        baseUrl: null,
        apiKey: key,
      }),
    ).rejects.toBeInstanceOf(PageGenerationDisabledError);
  });

  it('forgets the settings on delete', async () => {
    const ai = await controller(new FakeSecretCipher());
    await ai.update('tenant-1', 'admin-1', 'site-1', {
      provider: 'anthropic',
      model: 'claude-opus-5',
      baseUrl: null,
      apiKey: key,
    });
    await ai.remove('tenant-1', 'admin-1', 'site-1');

    expect(await ai.get('tenant-1', 'site-1')).toMatchObject({
      configured: false,
    });
  });

  it('says that a key was given and by whom, and never the key', async () => {
    const auditLog = new InMemoryAuditLog();
    const ai = await controller(new FakeSecretCipher(), auditLog);

    await ai.update('tenant-1', 'admin-1', 'site-1', {
      provider: 'anthropic',
      model: 'claude-opus-5',
      baseUrl: null,
      apiKey: key,
    });
    await ai.remove('tenant-1', 'admin-1', 'site-1');

    expect(auditLog.events).toEqual([
      {
        tenantId: 'tenant-1',
        actorUserId: 'admin-1',
        action: 'site.ai_changed',
        targetId: 'site-1',
        detail: { change: 'saved', provider: 'anthropic', keyChanged: true },
      },
      {
        tenantId: 'tenant-1',
        actorUserId: 'admin-1',
        action: 'site.ai_changed',
        targetId: 'site-1',
        detail: { change: 'removed' },
      },
    ]);
    expect(JSON.stringify(auditLog.events)).not.toContain(key);
  });
});

import { EventEmitter } from 'node:events';
import {
  PageGenerationDisabledError,
  PageGenerationFailedError,
  SiteNotFoundError,
} from '@kometio/domain-core';
import type { PageGenerationRequest, PageGeneratorPort } from '@kometio/ports';
import {
  buildSite,
  FakeSecretCipher,
  InMemorySiteAiSettingsRepository,
  InMemorySiteRepository,
} from '@kometio/testing';
import { GenerationSlots } from './generation-slots';
import { GeneratePageController } from './generate-page.controller';
import { PageGenerationDeps } from './page-generation.deps';
import type { EventStreamResponse } from './page-generation-stream';

/** The part of an Express response the controller streams through. */
class RecordedStream extends EventEmitter implements EventStreamResponse {
  statusCode = 0;
  headers: Record<string, string> = {};
  chunks: string[] = [];
  writableFinished = false;
  status(code: number) {
    this.statusCode = code;
    return this;
  }
  setHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  flushed = false;
  flushHeaders() {
    this.flushed = true;
  }
  write(chunk: string) {
    this.chunks.push(chunk);
    return true;
  }
  end() {
    this.writableFinished = true;
    this.emit('close');
  }
  events() {
    return this.chunks.map((chunk) => {
      const [, event, data] = /^event: (.+)\ndata: (.+)\n\n$/.exec(chunk) ?? [];
      return { event, data: JSON.parse(data) };
    });
  }
}

async function setUp(
  generate: PageGeneratorPort['generate'],
  {
    slots = new GenerationSlots(2),
    deadlineMs = 60_000,
    configured = true,
  }: {
    slots?: GenerationSlots;
    deadlineMs?: number;
    configured?: boolean;
  } = {},
) {
  const sites = new InMemorySiteRepository();
  await sites.add(buildSite({ name: 'Forno Aurelio' }));
  const aiSettings = new InMemorySiteAiSettingsRepository();
  const cipher = new FakeSecretCipher();
  if (configured) {
    await aiSettings.save('tenant-1', 'site-1', {
      provider: 'anthropic',
      model: 'claude-opus-5',
      baseUrl: null,
      apiKeySealed: cipher.seal('sk-ant-an-invented-key'),
      apiKeyHint: '-key',
    });
  }
  return new GeneratePageController(
    new PageGenerationDeps({
      siteRepository: sites,
      aiSettingsRepository: aiSettings,
      generation: { cipher, createGenerator: () => ({ generate }) },
      slots,
      deadlineMs,
    }),
  );
}

/** A deployment with no secrets key: page generation is off. */
function disabled() {
  return new GeneratePageController(
    new PageGenerationDeps({
      siteRepository: new InMemorySiteRepository(),
      aiSettingsRepository: new InMemorySiteAiSettingsRepository(),
      generation: null,
      slots: new GenerationSlots(2),
      deadlineMs: 60_000,
    }),
  );
}

const neverCalled = async (): Promise<never> => {
  throw new Error('never called');
};

const body = { prompt: 'La home di un forno', locale: 'it' };

describe('GeneratePageController', () => {
  it('streams progress, then the page', async () => {
    const controller = await setUp(async (request) => {
      for (const received of [50, 250, 300, 700])
        request.onProgress?.(received);
      return {
        answer: {
          blocks: [
            {
              ref: 'h',
              parent: null,
              type: 'Hero',
              props: { eyebrow: '', title: 'Pane', subtitle: '' },
            },
          ],
        },
        model: 'claude-opus-5',
        usage: { inputTokens: 1, outputTokens: 2, cachedInputTokens: 0 },
      };
    });
    const stream = new RecordedStream();

    await controller.generate('tenant-1', 'site-1', body, stream);

    expect(stream.statusCode).toBe(200);
    expect(stream.flushed).toBe(true);
    expect(stream.headers['Content-Type']).toContain('text/event-stream');
    const events = stream.events();
    expect(events.slice(0, -1)).toEqual([
      { event: 'progress', data: { received: 250 } },
      { event: 'progress', data: { received: 700 } },
    ]);
    expect(events.at(-1)).toMatchObject({
      event: 'done',
      data: { model: 'claude-opus-5', content: [{ type: 'Hero' }] },
    });
    expect(stream.writableFinished).toBe(true);
  });

  it('ends with the failure the editor explains', async () => {
    const controller = await setUp(async () => {
      throw new PageGenerationFailedError('rate-limited');
    });
    const stream = new RecordedStream();

    await controller.generate('tenant-1', 'site-1', body, stream);

    expect(stream.events()).toEqual([
      { event: 'error', data: { failure: 'rate-limited' } },
    ]);
  });

  it('refuses, before streaming, a site that already has as many pages in flight as it may', async () => {
    const slots = new GenerationSlots(1);
    const holding = slots.take('site-1');
    const controller = await setUp(neverCalled, { slots });
    const stream = new RecordedStream();

    await expect(
      controller.generate('tenant-1', 'site-1', body, stream),
    ).rejects.toEqual(new PageGenerationFailedError('busy'));
    expect(stream.statusCode).toBe(0);
    holding?.();
  });

  it('refuses, before streaming, a site with no provider, and takes no slot for it', async () => {
    const slots = new GenerationSlots(1);
    const controller = await setUp(neverCalled, { slots, configured: false });
    const stream = new RecordedStream();

    await expect(
      controller.generate('tenant-1', 'site-1', body, stream),
    ).rejects.toEqual(new PageGenerationFailedError('not-configured'));
    expect(stream.statusCode).toBe(0);
    expect(slots.take('site-1')).not.toBeNull();
  });

  it('refuses, before streaming, where the deployment has page generation off', async () => {
    const stream = new RecordedStream();

    await expect(
      disabled().generate('tenant-1', 'site-1', body, stream),
    ).rejects.toBeInstanceOf(PageGenerationDisabledError);
    expect(stream.statusCode).toBe(0);
  });

  it('gives the slot back when the page is done, or has failed', async () => {
    const slots = new GenerationSlots(1);
    const controller = await setUp(
      async () => {
        throw new PageGenerationFailedError('rate-limited');
      },
      { slots },
    );

    await controller.generate('tenant-1', 'site-1', body, new RecordedStream());

    expect(slots.take('site-1')).not.toBeNull();
  });

  it('stops the provider and says so when it takes longer than the server waits', async () => {
    let seen: PageGenerationRequest | undefined;
    const controller = await setUp(
      (request) =>
        new Promise((_, reject) => {
          seen = request;
          request.signal?.addEventListener('abort', () =>
            reject(new Error('aborted')),
          );
        }),
      { deadlineMs: 50 },
    );
    const stream = new RecordedStream();

    await controller.generate('tenant-1', 'site-1', body, stream);

    expect(seen?.signal?.aborted).toBe(true);
    expect(stream.events()).toEqual([
      { event: 'error', data: { failure: 'timed-out' } },
    ]);
  });

  it('cancels the provider when the person leaves', async () => {
    let seen: PageGenerationRequest | undefined;
    const stream = new RecordedStream();
    const controller = await setUp(
      (request) =>
        new Promise((_, reject) => {
          seen = request;
          request.signal?.addEventListener('abort', () =>
            reject(new Error('aborted')),
          );
          stream.emit('close');
        }),
    );

    await controller.generate('tenant-1', 'site-1', body, stream);

    expect(seen?.signal?.aborted).toBe(true);
    expect(stream.chunks).toEqual([]);
  });

  it('says whether generation can work, without the settings behind it', async () => {
    const controller = await setUp(neverCalled);
    expect(await controller.status('tenant-1', 'site-1')).toEqual({
      availability: 'ready',
    });
    expect(await controller.status('tenant-1', 'site-2')).toEqual({
      availability: 'not-configured',
    });
    expect(await disabled().status('tenant-1', 'site-1')).toEqual({
      availability: 'server-disabled',
    });
  });

  it("answers 404 for a site that is not the tenant's own, before streaming", async () => {
    const controller = await setUp(neverCalled);
    const stream = new RecordedStream();

    await expect(
      controller.generate('tenant-1', 'site-2', body, stream),
    ).rejects.toBeInstanceOf(SiteNotFoundError);
    expect(stream.statusCode).toBe(0);
  });
});

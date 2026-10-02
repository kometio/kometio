import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './http-client';
import {
  generatePage,
  PageGenerationError,
  updateAiSettings,
} from './page-generation-api-client';

/** A server-sent-events body delivered in the pieces given, as a network would. */
function streamOf(...pieces: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const piece of pieces) controller.enqueue(encoder.encode(piece));
        controller.close();
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  );
}

const donePage = {
  content: [{ id: 'b1', type: 'Hero', props: { title: 'Pane' } }],
  dropped: [{ ref: 'x', type: 'NotABlock', reason: 'unknown-type' }],
  placeholderCount: 1,
  model: 'claude-opus-5',
  usage: { inputTokens: 1, outputTokens: 2, cachedInputTokens: 0 },
};

const request = { prompt: 'La home di un forno', locale: 'it' };

describe('generatePage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports progress and returns the page, even with events split across pieces', async () => {
    const done = `event: done\ndata: ${JSON.stringify(donePage)}\n\n`;
    vi.mocked(fetch).mockResolvedValue(
      streamOf(
        'event: progress\ndata: {"received":2',
        '10}\n\nevent: progress\ndata: {"received":480}\n\n',
        done.slice(0, 30),
        done.slice(30),
      ),
    );
    const progress: number[] = [];

    const page = await generatePage('site-1', request, {
      onProgress: (received) => progress.push(received),
    });

    expect(progress).toEqual([210, 480]);
    expect(page).toEqual({
      content: donePage.content,
      droppedCount: 1,
      placeholderCount: 1,
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/sites/site-1/generate-page'),
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify(request),
      }),
    );
  });

  it('throws the failure the server named', async () => {
    vi.mocked(fetch).mockResolvedValue(
      streamOf('event: error\ndata: {"failure":"rejected-credentials"}\n\n'),
    );

    await expect(generatePage('site-1', request, {})).rejects.toEqual(
      new PageGenerationError('rejected-credentials'),
    );
  });

  it('calls a stream that ends with neither a page nor a reason unreachable', async () => {
    vi.mocked(fetch).mockResolvedValue(
      streamOf('event: progress\ndata: {"received":10}\n\n'),
    );

    await expect(generatePage('site-1', request, {})).rejects.toMatchObject({
      failure: 'unreachable',
    });
  });

  it('skips a frame it cannot read, and still takes the page after it', async () => {
    vi.mocked(fetch).mockResolvedValue(
      streamOf(
        'event: progress\ndata: {not json\n\n',
        'event: progress\ndata: {"received":"many"}\n\n',
        `event: done\ndata: ${JSON.stringify(donePage)}\n\n`,
      ),
    );

    await expect(generatePage('site-1', request, {})).resolves.toMatchObject({
      droppedCount: 1,
    });
  });

  it('calls a connection that drops mid-stream unreachable, not unexpected', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                'event: progress\ndata: {"received":1}\n\n',
              ),
            );
            controller.error(new TypeError('network error'));
          },
        }),
        { status: 200 },
      ),
    );

    await expect(generatePage('site-1', request, {})).rejects.toMatchObject({
      failure: 'unreachable',
    });
  });

  it('calls a server it could not reach at all unreachable', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(generatePage('site-1', request, {})).rejects.toMatchObject({
      failure: 'unreachable',
    });
  });

  it('turns a refusal before the stream opens into an ApiError', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ statusCode: 429 }), { status: 429 }),
    );

    const failure = generatePage('site-1', request, {});
    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({ status: 429 });
  });

  it('says a refusal that names its failure the way the stream would', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ statusCode: 409, message: 'busy', error: 'Conflict' }),
        { status: 409 },
      ),
    );

    await expect(generatePage('site-1', request, {})).rejects.toEqual(
      new PageGenerationError('busy'),
    );
  });

  it('passes the caller’s signal on, so closing the dialog closes the stream', async () => {
    vi.mocked(fetch).mockResolvedValue(
      streamOf(`event: done\ndata: ${JSON.stringify(donePage)}\n\n`),
    );
    const controller = new AbortController();

    await generatePage('site-1', request, { signal: controller.signal });
    const { signal } = vi.mocked(fetch).mock.calls[0][1] ?? {};
    expect(signal?.aborted).toBe(false);
    controller.abort();
    expect(signal?.aborted).toBe(true);
  });
});

describe('updateAiSettings', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the settings and reads back only the view, never a key', async () => {
    const view = {
      configured: true,
      provider: 'anthropic',
      model: 'claude-opus-5',
      baseUrl: null,
      apiKeyHint: 'Q7x2',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(view))),
    );

    expect(
      await updateAiSettings('site-1', {
        provider: 'anthropic',
        model: 'claude-opus-5',
        baseUrl: null,
      }),
    ).toEqual(view);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/sites/site-1/ai-settings'),
      expect.objectContaining({ method: 'PUT' }),
    );
  });
});

import { PageGenerationFailedError } from '@kometio/domain-core';
import type { PageGenerationRequest } from '@kometio/ports';
import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import {
  MAX_ANSWER_CHARACTERS,
  OpenAiCompatiblePageGenerator,
  type OpenAiCompatiblePageGeneratorOptions,
} from './openai-compatible-page-generator.adapter';

type FakeFetch = NonNullable<OpenAiCompatiblePageGeneratorOptions['fetch']>;

/** A streamed chat completion, cut into `pieces` wherever the bytes fall. */
function sse(events: unknown[], pieces = 7): ReadableStream<Uint8Array> {
  const text =
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') +
    'data: [DONE]\n\n';
  const bytes = new TextEncoder().encode(text);
  // Split mid-line, as a network does: a line must survive being cut.
  const size = Math.ceil(bytes.length / pieces);
  return new ReadableStream({
    start(controller) {
      for (let at = 0; at < bytes.length; at += size) {
        controller.enqueue(bytes.slice(at, at + size));
      }
      controller.close();
    },
  });
}

function server(response: () => Response) {
  const sent: {
    url: string;
    body: Record<string, unknown>;
    headers: Headers;
  }[] = [];
  const fakeFetch: FakeFetch = async (input, init) => {
    sent.push({
      url: String(input),
      body: JSON.parse(String(init.body)),
      headers: new Headers(init.headers),
    });
    return response();
  };
  return { fakeFetch, sent };
}

function generator(fakeFetch: FakeFetch) {
  return new OpenAiCompatiblePageGenerator({
    baseUrl: 'http://localhost:11434/v1/',
    apiKey: 'local',
    model: 'qwen3:14b',
    fetch: fakeFetch,
  });
}

const request: PageGenerationRequest = {
  stableInstructions: 'The block catalogue.',
  contextInstructions: 'A bakery, in Italian.',
  prompt: 'A home page',
  outputSchema: { type: 'object' },
};

const delta = (content: string) => ({
  model: 'qwen3:14b',
  choices: [{ delta: { content } }],
});

describe('OpenAiCompatiblePageGenerator', () => {
  it('streams the answer, asks for the schema, and returns what it parsed', async () => {
    const { fakeFetch, sent } = server(
      () =>
        new Response(
          sse([
            delta('{"blocks":'),
            delta('[]}'),
            { choices: [{ delta: {}, finish_reason: 'stop' }] },
            {
              choices: [],
              usage: {
                prompt_tokens: 5000,
                completion_tokens: 40,
                prompt_tokens_details: { cached_tokens: 4200 },
              },
            },
          ]),
          { status: 200 },
        ),
    );
    const progress: number[] = [];

    const result = await generator(fakeFetch).generate({
      ...request,
      onProgress: (received) => progress.push(received),
    });

    expect(result).toEqual({
      answer: { blocks: [] },
      model: 'qwen3:14b',
      usage: { inputTokens: 5000, outputTokens: 40, cachedInputTokens: 4200 },
    });
    expect(progress).toEqual([10, 13]);
    // One slash, however the base URL was written.
    expect(sent[0].url).toBe('http://localhost:11434/v1/chat/completions');
    expect(sent[0].headers.get('authorization')).toBe('Bearer local');
    expect(sent[0].body).toMatchObject({
      model: 'qwen3:14b',
      stream: true,
      messages: [
        {
          role: 'system',
          content: 'The block catalogue.\n\nA bakery, in Italian.',
        },
        { role: 'user', content: 'A home page' },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'page', strict: true, schema: { type: 'object' } },
      },
    });
  });

  it.each([
    [
      'cut short',
      () =>
        new Response(
          sse([
            delta('{}'),
            { choices: [{ delta: {}, finish_reason: 'length' }] },
          ]),
        ),
      'truncated',
    ],
    [
      'a refusal',
      () => new Response(sse([{ choices: [{ delta: { refusal: 'No.' } }] }])),
      'refused',
    ],
    [
      'filtered',
      () =>
        new Response(
          sse([{ choices: [{ delta: {}, finish_reason: 'content_filter' }] }]),
        ),
      'refused',
    ],
    ['prose', () => new Response(sse([delta('Sure! Here is')])), 'not-json'],
    [
      'a 401',
      () => new Response('no', { status: 401 }),
      'rejected-credentials',
    ],
    ['a 429', () => new Response('no', { status: 429 }), 'rate-limited'],
    ['a 500', () => new Response('no', { status: 500 }), 'unreachable'],
  ] as const)('reports %s as %s', async (_, response, failure) => {
    const { fakeFetch } = server(response);
    const generating = generator(fakeFetch).generate(request);

    await expect(generating).rejects.toBeInstanceOf(PageGenerationFailedError);
    await expect(generating).rejects.toMatchObject({ failure });
  });

  it('stops reading a server that writes far more than a page', async () => {
    const piece = 'x'.repeat(10_000);
    const endless = Array.from(
      { length: MAX_ANSWER_CHARACTERS / piece.length + 2 },
      () => delta(piece),
    );
    const { fakeFetch } = server(
      () => new Response(sse(endless, 50), { status: 200 }),
    );

    await expect(generator(fakeFetch).generate(request)).rejects.toMatchObject({
      failure: 'truncated',
    });
  });

  it('does not follow a redirect to wherever the server points', async () => {
    let redirect: string | undefined;
    const spy: FakeFetch = async (_input, init) => {
      redirect = init.redirect;
      throw new TypeError('fetch failed');
    };

    await expect(generator(spy).generate(request)).rejects.toMatchObject({
      failure: 'unreachable',
    });
    expect(redirect).toBe('error');
  });

  it('reports a server it cannot reach, and lets a cancellation through', async () => {
    const down: FakeFetch = async () => {
      throw new TypeError('fetch failed');
    };
    await expect(generator(down).generate(request)).rejects.toMatchObject({
      failure: 'unreachable',
    });

    const cancelled: FakeFetch = async () => {
      throw new DOMException('aborted', 'AbortError');
    };
    await expect(generator(cancelled).generate(request)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});

describe('OpenAiCompatiblePageGenerator inside the network', () => {
  let local: Server | undefined;

  afterEach(() => {
    local?.close();
    local = undefined;
  });

  /** A real server on this machine, answering one page. */
  async function localServer(): Promise<{ port: number; hits: () => number }> {
    let hits = 0;
    local = createServer((_req, res) => {
      hits += 1;
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end(
        `data: ${JSON.stringify(delta('{"blocks":[]}'))}\n\ndata: [DONE]\n\n`,
      );
    });
    await new Promise<void>((resolve) => local?.listen(0, resolve));
    const address = local.address();
    if (address === null || typeof address === 'string') {
      throw new Error('The test server has no port.');
    }
    return { port: address.port, hits: () => hits };
  }

  it('refuses an address written as a private IP without trying it', async () => {
    let called = false;
    const spy: FakeFetch = async () => {
      called = true;
      throw new TypeError('fetch failed');
    };
    for (const baseUrl of [
      'http://127.0.0.1:11434/v1',
      'http://[::1]:11434/v1',
      'http://169.254.169.254/latest',
      'http://10.0.0.5/v1',
    ]) {
      await expect(
        new OpenAiCompatiblePageGenerator({
          baseUrl,
          apiKey: 'k',
          model: 'm',
          fetch: spy,
        }).generate(request),
        baseUrl,
      ).rejects.toMatchObject({ failure: 'private-address' });
    }
    expect(called).toBe(false);
  });

  it('refuses a name that resolves to this machine, on a real connection', async () => {
    const { port, hits } = await localServer();

    await expect(
      new OpenAiCompatiblePageGenerator({
        baseUrl: `http://localhost:${port}/v1`,
        apiKey: 'k',
        model: 'm',
      }).generate(request),
    ).rejects.toMatchObject({ failure: 'private-address' });
    expect(hits()).toBe(0);
  });

  it('reaches it when the operator allows servers inside the network', async () => {
    const { port, hits } = await localServer();

    const page = await new OpenAiCompatiblePageGenerator({
      baseUrl: `http://localhost:${port}/v1`,
      apiKey: 'k',
      model: 'm',
      allowPrivateHosts: true,
    }).generate(request);

    expect(page.answer).toEqual({ blocks: [] });
    expect(hits()).toBe(1);
  });
});

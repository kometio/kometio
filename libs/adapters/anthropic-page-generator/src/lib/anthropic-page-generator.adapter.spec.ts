import Anthropic from '@anthropic-ai/sdk';
import { PageGenerationFailedError } from '@kometio/domain-core';
import type { PageGenerationRequest } from '@kometio/ports';
import { describe, expect, it } from 'vitest';
import { AnthropicPageGenerator } from './anthropic-page-generator.adapter';

/*
 * A fake Messages API: it records what the SDK sent and answers with a real
 * server-sent event stream, so the SDK's own parsing is part of the test.
 */
function fakeServer(reply: {
  status?: number;
  text?: string;
  stopReason?: string;
}) {
  const sent: {
    url: string;
    body: Record<string, unknown>;
    headers: Headers;
  }[] = [];
  const fakeFetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    sent.push({
      url: String(input),
      body: JSON.parse(String(init?.body)),
      headers: new Headers(init?.headers),
    });
    if (reply.status && reply.status !== 200) {
      return new Response(
        JSON.stringify({
          type: 'error',
          error: { type: 'error', message: 'no' },
        }),
        {
          status: reply.status,
          headers: { 'content-type': 'application/json' },
        },
      );
    }
    const text = reply.text ?? '';
    const events: [string, unknown][] = [
      [
        'message_start',
        {
          type: 'message_start',
          message: {
            id: 'msg_1',
            type: 'message',
            role: 'assistant',
            model: 'claude-opus-5',
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: {
              input_tokens: 900,
              output_tokens: 1,
              cache_read_input_tokens: 4000,
            },
          },
        },
      ],
      [
        'content_block_start',
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' },
        },
      ],
      [
        'content_block_delta',
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: text.slice(0, 10) },
        },
      ],
      [
        'content_block_delta',
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: text.slice(10) },
        },
      ],
      ['content_block_stop', { type: 'content_block_stop', index: 0 }],
      [
        'message_delta',
        {
          type: 'message_delta',
          delta: {
            stop_reason: reply.stopReason ?? 'end_turn',
            stop_sequence: null,
          },
          usage: { output_tokens: 250 },
        },
      ],
      ['message_stop', { type: 'message_stop' }],
    ];
    const body = events
      .map(
        ([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
      )
      .join('');
    return new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  };
  const client = new Anthropic({
    apiKey: 'test-key',
    fetch: fakeFetch,
    maxRetries: 0,
  });
  return { client, sent };
}

const request: PageGenerationRequest = {
  stableInstructions: 'The block catalogue.',
  contextInstructions: 'A bakery in Milan, in Italian.',
  prompt: 'A home page',
  outputSchema: { type: 'object', properties: {}, additionalProperties: false },
};

describe('AnthropicPageGenerator', () => {
  it('asks for the page schema, caches the catalogue, and returns the parsed answer', async () => {
    const { client, sent } = fakeServer({ text: '{"blocks":[{"ref":"a"}]}' });
    const progress: number[] = [];
    const generator = new AnthropicPageGenerator({
      apiKey: 'x',
      model: 'claude-opus-5',
      client,
    });

    const result = await generator.generate({
      ...request,
      onProgress: (received) => progress.push(received),
    });

    expect(result).toEqual({
      answer: { blocks: [{ ref: 'a' }] },
      model: 'claude-opus-5',
      usage: { inputTokens: 900, outputTokens: 250, cachedInputTokens: 4000 },
    });
    expect(progress).toEqual([10, 24]);

    const { body, headers } = sent[0];
    expect(body['model']).toBe('claude-opus-5');
    expect(body['stream']).toBe(true);
    expect(body['output_config']).toEqual({
      format: { type: 'json_schema', schema: request.outputSchema },
    });
    expect(body['system']).toEqual([
      {
        type: 'text',
        text: 'The block catalogue.',
        cache_control: { type: 'ephemeral' },
      },
      { type: 'text', text: 'A bakery in Milan, in Italian.' },
    ]);
    expect(body['messages']).toEqual([
      { role: 'user', content: 'A home page' },
    ]);
    // A declined request is re-run on another model instead of stopping.
    expect(body['fallbacks']).toBe('default');
    expect(headers.get('anthropic-beta')).toContain(
      'server-side-fallback-2026-07-01',
    );
  });

  it('asks for no fallback on a model that does not take the default one', async () => {
    const { client, sent } = fakeServer({ text: '{}' });
    await new AnthropicPageGenerator({
      apiKey: 'x',
      model: 'claude-sonnet-5',
      client,
    }).generate(request);

    expect(sent[0].body['fallbacks']).toBeUndefined();
  });

  it.each([
    [{ text: '{}', stopReason: 'refusal' }, 'refused'],
    [{ text: '{"blocks":[', stopReason: 'max_tokens' }, 'truncated'],
    [{ text: 'Here is your page:' }, 'not-json'],
    [{ status: 401 }, 'rejected-credentials'],
    [{ status: 403 }, 'rejected-credentials'],
    [{ status: 429 }, 'rate-limited'],
    [{ status: 529 }, 'unreachable'],
  ] as const)('reports %o as %s', async (reply, failure) => {
    const { client } = fakeServer(reply);
    const generating = new AnthropicPageGenerator({
      apiKey: 'x',
      model: 'claude-opus-5',
      client,
    }).generate(request);

    await expect(generating).rejects.toBeInstanceOf(PageGenerationFailedError);
    await expect(generating).rejects.toMatchObject({ failure });
  });
});

import { Agent, fetch as undiciFetch } from 'undici';
import { z } from 'zod';
import { PageGenerationFailedError } from '@kometio/domain-core';
import {
  failureOfProviderStatus,
  readProviderAnswer,
  type PageGenerationRequest,
  type PageGenerationResult,
  type PageGeneratorPort,
  type ProviderAnswerEnding,
} from '@kometio/ports';
import {
  isPrivateAddress,
  PrivateAddressRefusedError,
  publicOnlyLookup,
} from './private-address';

export interface OpenAiCompatiblePageGeneratorOptions {
  /** Where the API lives, up to `/v1`: `http://localhost:11434/v1` for Ollama. */
  baseUrl: string;
  /** Sent as a bearer token; a local server may accept anything. */
  apiKey: string;
  model: string;
  /**
   * Whether the server may be inside the network the API runs in: this
   * machine, a private range, cloud metadata. Off unless the operator turns
   * it on (`KOMETIO_AI_ALLOW_PRIVATE_HOSTS`), for a model on their own
   * machine; otherwise whoever administers a site could make the API call
   * services that were never meant to be reached from outside.
   */
  allowPrivateHosts?: boolean;
  /** For tests: stands in for the network, and for the check on it. */
  fetch?: Fetcher;
}

/** What is used of `fetch`: the global one in tests, undici's own otherwise. */
type Fetcher = (
  url: string,
  init: {
    method: string;
    signal?: AbortSignal;
    redirect: 'error';
    headers: Record<string, string>;
    body: string;
    dispatcher?: Agent;
  },
) => Promise<{
  status: number;
  ok: boolean;
  body: ReadableStream<Uint8Array> | null;
}>;

/**
 * Connections that refuse, as they are made, an address inside the
 * network — checked on the address actually connected to, so a name that
 * resolves differently a second time cannot slip past.
 */
const PUBLIC_ONLY = new Agent({ connect: { lookup: publicOnlyLookup } });

/**
 * Writes a page with any server that speaks the OpenAI chat completions
 * API: OpenAI itself, Ollama, LM Studio, OpenRouter. Plain `fetch`, no SDK,
 * because what it depends on is the protocol, not a vendor.
 *
 * The answer is asked for with a JSON Schema `response_format`; a server
 * that does not enforce it may still answer outside it, which is why the
 * application reads every answer leniently and checks each block itself.
 */
export class OpenAiCompatiblePageGenerator implements PageGeneratorPort {
  constructor(private readonly options: OpenAiCompatiblePageGeneratorOptions) {}

  async generate(
    request: PageGenerationRequest,
  ): Promise<PageGenerationResult> {
    const allowPrivate = this.options.allowPrivateHosts === true;
    const url = `${this.options.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    // An address written as an IP is connected to without a lookup, so it
    // is checked here; a name is checked as it is resolved (PUBLIC_ONLY).
    if (!allowPrivate && isPrivateAddress(hostOf(url))) {
      throw new PageGenerationFailedError('private-address');
    }
    const doFetch: Fetcher = this.options.fetch ?? undiciFetch;
    let response: Awaited<ReturnType<Fetcher>>;
    try {
      response = await doFetch(url, {
        ...(allowPrivate ? {} : { dispatcher: PUBLIC_ONLY }),
        method: 'POST',
        signal: request.signal,
        // The address is the admin's; where it redirects is not. A public
        // server must not be able to bounce this request inside the
        // network the API runs in.
        redirect: 'error',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          model: this.options.model,
          stream: true,
          stream_options: { include_usage: true },
          messages: [
            // Catalogue first: a server that caches a prompt's prefix
            // (OpenAI does, automatically) reuses it across pages.
            {
              role: 'system',
              content: `${request.stableInstructions}\n\n${request.contextInstructions}`,
            },
            { role: 'user', content: request.prompt },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'page',
              strict: true,
              schema: request.outputSchema,
            },
          },
        }),
      });
    } catch (error) {
      if (isAbort(error)) throw error;
      throw new PageGenerationFailedError(
        causeOf(error) instanceof PrivateAddressRefusedError
          ? 'private-address'
          : 'unreachable',
      );
    }

    if (!response.ok || !response.body) {
      // Not read, so let go: undici keeps the connection until a body is
      // consumed or cancelled.
      await response.body?.cancel();
      throw new PageGenerationFailedError(
        failureOfProviderStatus(response.status),
      );
    }

    const read = await readStream(response.body, request.onProgress);
    return {
      answer: readProviderAnswer(read.text, endingOf(read)),
      model: read.model ?? this.options.model,
      usage: read.usage,
    };
  }
}

/**
 * A page is a few tens of thousands of characters at most; a server still
 * writing past this is not writing a page, and is not kept in memory.
 */
export const MAX_ANSWER_CHARACTERS = 200_000;

interface StreamRead {
  text: string;
  refused: boolean;
  finishReason: string | null;
  model: string | null;
  usage: PageGenerationResult['usage'];
}

/** The server-sent events of a streamed chat completion, gathered up. */
async function readStream(
  body: ReadableStream<Uint8Array>,
  onProgress: ((received: number) => void) | undefined,
): Promise<StreamRead> {
  const read: StreamRead = {
    text: '',
    refused: false,
    finishReason: null,
    model: null,
    usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
  };
  const decoder = new TextDecoder();
  let buffered = '';
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    buffered += done
      ? decoder.decode()
      : decoder.decode(value, { stream: true });
    const lines = buffered.split('\n');
    buffered = done ? '' : (lines.pop() ?? '');
    for (const line of lines) {
      const data = line.startsWith('data:') ? line.slice(5).trim() : null;
      if (!data || data === '[DONE]') continue;
      const chunk = parseChunk(data);
      if (!chunk) continue;
      read.model ??= chunk.model ?? null;
      const choice = chunk.choices?.[0];
      if (choice?.delta?.content) {
        read.text += choice.delta.content;
        if (read.text.length > MAX_ANSWER_CHARACTERS) {
          await reader.cancel();
          throw new PageGenerationFailedError('truncated');
        }
        onProgress?.(read.text.length);
      }
      if (choice?.delta?.refusal) read.refused = true;
      if (choice?.finish_reason) read.finishReason = choice.finish_reason;
      if (chunk.usage) {
        read.usage = {
          inputTokens: chunk.usage.prompt_tokens ?? 0,
          outputTokens: chunk.usage.completion_tokens ?? 0,
          cachedInputTokens:
            chunk.usage.prompt_tokens_details?.cached_tokens ?? 0,
        };
      }
    }
    if (done) return read;
  }
}

/**
 * One event of a streamed chat completion — the fields read here, each
 * optional because servers differ in what they send (Ollama leaves out
 * `usage` details, a refusal is OpenAI's alone). Anything else is ignored.
 */
const completionChunkSchema = z.object({
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        delta: z
          .object({
            content: z.string().nullish(),
            refusal: z.string().nullish(),
          })
          .optional(),
        finish_reason: z.string().nullish(),
      }),
    )
    .optional(),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
      prompt_tokens_details: z
        .object({ cached_tokens: z.number().optional() })
        .nullish(),
    })
    .nullish(),
});

function parseChunk(data: string) {
  try {
    const parsed = completionChunkSchema.safeParse(JSON.parse(data));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * How the server stopped: a refusal is OpenAI's own field, a content
 * filter its finish reason; `length` is running out of room.
 */
function endingOf(read: StreamRead): ProviderAnswerEnding {
  if (read.refused || read.finishReason === 'content_filter') return 'refused';
  if (read.finishReason === 'length') return 'truncated';
  return 'complete';
}

/** The host of an address, without the brackets around an IPv6 one. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^\[|\]$/g, '');
  } catch {
    return '';
  }
}

/** What a failed fetch says went wrong underneath: undici wraps it in `cause`. */
function causeOf(error: unknown): unknown {
  return error instanceof Error ? error.cause : undefined;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

import Anthropic from '@anthropic-ai/sdk';
import { PageGenerationFailedError } from '@kometio/domain-core';
import {
  failureOfProviderStatus,
  readProviderAnswer,
  type PageGenerationRequest,
  type PageGenerationResult,
  type PageGeneratorPort,
  type ProviderAnswerEnding,
} from '@kometio/ports';

export interface AnthropicPageGeneratorOptions {
  apiKey: string;
  /** `claude-opus-5` unless the site chose another. */
  model: string;
  /** For tests: a client pointed at a fake server. */
  client?: Anthropic;
}

export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5';

/**
 * A page takes a few thousand tokens to write — 120 blocks, the most a page
 * keeps, stay well inside this. It is also the most one request can cost
 * the site's owner. Streamed, so a long answer never meets an HTTP timeout.
 */
const MAX_OUTPUT_TOKENS = 16_000;

/**
 * Models that decline through safety classifiers and accept the server
 * re-running a declined request on another model (`fallbacks: "default"`),
 * instead of the request simply stopping.
 */
const MODELS_WITH_DEFAULT_FALLBACK = new Set(['claude-opus-5']);

/**
 * Writes a page with Claude, through the official SDK: the answer is held
 * to the page schema by structured output, and the block catalogue — the
 * same on every call — is cached, so after the first page only the site's
 * own instructions and the prompt are read at full price.
 */
export class AnthropicPageGenerator implements PageGeneratorPort {
  private readonly client: Anthropic;

  constructor(private readonly options: AnthropicPageGeneratorOptions) {
    // No retries: a request retried after the provider had started on it
    // can be billed twice, and the person can press Generate again.
    this.client =
      options.client ??
      new Anthropic({ apiKey: options.apiKey, maxRetries: 0 });
  }

  async generate(
    request: PageGenerationRequest,
  ): Promise<PageGenerationResult> {
    const fallback = MODELS_WITH_DEFAULT_FALLBACK.has(this.options.model)
      ? {
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default' as const,
        }
      : {};

    let message: Anthropic.Beta.BetaMessage;
    try {
      const stream = this.client.beta.messages.stream(
        {
          model: this.options.model,
          max_tokens: MAX_OUTPUT_TOKENS,
          ...fallback,
          system: [
            {
              type: 'text',
              text: request.stableInstructions,
              cache_control: { type: 'ephemeral' },
            },
            { type: 'text', text: request.contextInstructions },
          ],
          messages: [{ role: 'user', content: request.prompt }],
          output_config: {
            format: { type: 'json_schema', schema: request.outputSchema },
          },
        },
        { signal: request.signal },
      );
      let received = 0;
      stream.on('text', (delta) => {
        received += delta.length;
        request.onProgress?.(received);
      });
      message = await stream.finalMessage();
    } catch (error) {
      // The person cancelled: nothing failed, and the caller knows why.
      if (error instanceof Anthropic.APIUserAbortError) throw error;
      // From the SDK's typed errors, never from their messages.
      throw new PageGenerationFailedError(
        failureOfProviderStatus(
          error instanceof Anthropic.APIError ? error.status : undefined,
        ),
      );
    }

    const text = message.content
      .filter(
        (block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text',
      )
      .map((block) => block.text)
      .join('');
    const answer = readProviderAnswer(text, endingOf(message.stop_reason));

    return {
      answer,
      model: message.model,
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cachedInputTokens: message.usage.cache_read_input_tokens ?? 0,
      },
    };
  }
}

/**
 * How Claude stopped: `refusal` when the whole chain declined (a fallback,
 * when there was one, too), `max_tokens` when it ran out of room.
 */
function endingOf(
  stopReason: Anthropic.Beta.BetaMessage['stop_reason'],
): ProviderAnswerEnding {
  if (stopReason === 'refusal') return 'refused';
  if (stopReason === 'max_tokens') return 'truncated';
  return 'complete';
}

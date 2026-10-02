import type { PageGeneratorProvider } from '@kometio/shared-types';

/*
 * A language model that writes a page (docs/adr — page generation). The
 * port knows nothing of blocks: it is handed instructions and a JSON Schema
 * and returns the JSON the model wrote, unchecked. The application checks
 * it against the block catalogue; an adapter only talks to a provider.
 *
 * Implemented by @kometio/anthropic-page-generator (Claude) and
 * @kometio/openai-compatible-page-generator (OpenAI, Ollama, LM Studio and
 * anything else that speaks the same API). Failures are thrown as
 * PageGenerationFailedError, whose code the editor turns into a sentence.
 */

export interface PageGenerationRequest {
  /**
   * Instructions that are the same on every call — the block catalogue.
   * Sent first, so a provider that caches a prompt's prefix caches it.
   */
  stableInstructions: string;
  /** Instructions about this site and this page: its language, its business. */
  contextInstructions: string;
  /** What the person asked for, in their own words. */
  prompt: string;
  /** The JSON Schema the answer must follow. */
  outputSchema: Record<string, unknown>;
  /** Called as the answer arrives, with how much of it has — for a progress indicator. */
  onProgress?: (receivedCharacters: number) => void;
  signal?: AbortSignal;
}

export interface PageGenerationUsage {
  inputTokens: number;
  outputTokens: number;
  /** Input tokens served from the provider's cache, when it reports them. */
  cachedInputTokens: number;
}

export interface PageGenerationResult {
  /** The JSON the model wrote, parsed but not yet checked. */
  answer: unknown;
  /** The model that actually wrote it (a provider may fall back to another). */
  model: string;
  usage: PageGenerationUsage;
}

export interface PageGeneratorPort {
  generate(request: PageGenerationRequest): Promise<PageGenerationResult>;
}

/** Which provider a site uses and how to reach it. */
export interface PageGeneratorConnection {
  provider: PageGeneratorProvider;
  apiKey: string;
  model: string;
  /** Required for `openai-compatible` (http://localhost:11434/v1 for Ollama); ignored by Anthropic. */
  baseUrl?: string;
}

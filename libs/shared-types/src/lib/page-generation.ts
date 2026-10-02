import { type Block } from './content-model';

/**
 * Who writes a generated page: Claude, or any server that speaks the
 * OpenAI chat completions API (OpenAI, Ollama, LM Studio, OpenRouter).
 */
export const PAGE_GENERATOR_PROVIDERS = [
  'anthropic',
  'openai-compatible',
] as const;

export type PageGeneratorProvider = (typeof PAGE_GENERATOR_PROVIDERS)[number];

/**
 * Why generating a page from a prompt did not produce one — a code the
 * editor turns into a sentence in the person's language.
 */
export const PAGE_GENERATION_FAILURES = [
  /** No provider is configured for this site. */
  'not-configured',
  /**
   * The stored API key can no longer be opened — the secrets key it was
   * sealed with is gone. Typing the key in again fixes it.
   */
  'key-unreadable',
  /** The provider turned the key down. */
  'rejected-credentials',
  /** Too many requests to the provider, for now. */
  'rate-limited',
  /** The provider could not be reached, or failed on its side. */
  'unreachable',
  /** The model declined to write this page. */
  'refused',
  /** The answer was cut off before it ended. */
  'truncated',
  /** The answer was not the JSON it was asked for. */
  'not-json',
  /** Every block the model wrote had to be dropped. */
  'empty',
  /** The provider took longer than the server waits for a page. */
  'timed-out',
  /** The site already has as many pages being written as it may at once. */
  'busy',
  /**
   * The server's address is inside the API's own network (this machine, a
   * private range), which the operator has not allowed.
   */
  'private-address',
] as const;

export type PageGenerationFailure = (typeof PAGE_GENERATION_FAILURES)[number];

/**
 * The text a generated page uses where it would otherwise invent a fact
 * about a real person or a number — the editor recognises it and says the
 * page still has something to fill in.
 */
export const GENERATION_PLACEHOLDERS = {
  en: {
    personName: '[Customer name]',
    teamMemberName: '[Name]',
    role: '[Role]',
    price: '[Price]',
  },
  it: {
    personName: '[Nome del cliente]',
    teamMemberName: '[Nome]',
    role: '[Ruolo]',
    price: '[Prezzo]',
  },
} as const;

export type PlaceholderKey = keyof (typeof GENERATION_PLACEHOLDERS)['en'];

const PLACEHOLDER_TEXTS: readonly string[] = Object.values(
  GENERATION_PLACEHOLDERS,
).flatMap((texts) => Object.values(texts));

/**
 * The placeholders still on a page, by block id, at every depth: a text
 * a generated page put where it would otherwise have invented a person or
 * a price, and a Stat whose figure it left at 0 — a figure really worth 0
 * is flagged too, which is rare and harmless next to publishing an
 * invented number.
 */
export function findPlaceholders(
  blocks: readonly Block[],
): ReadonlyMap<string, readonly string[]> {
  const found = new Map<string, string[]>();
  const walk = (list: readonly Block[]): void => {
    for (const block of list) {
      const own = Object.values(block.props).filter(
        (value): value is string =>
          typeof value === 'string' &&
          PLACEHOLDER_TEXTS.some((text) => value.includes(text)),
      );
      if (block.type === 'Stat' && block.props['value'] === 0) {
        own.push('0');
      }
      if (block.id && own.length > 0) found.set(block.id, own);
      if (block.children) walk(block.children);
    }
  };
  walk(blocks);
  return found;
}

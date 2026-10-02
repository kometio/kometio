import { PageGenerationFailedError } from '@kometio/domain-core';
import type { PageGenerationFailure } from '@kometio/shared-types';

/**
 * How a provider's answer stopped, in the words every provider shares:
 * it finished, the model declined, or it ran out of room.
 */
export type ProviderAnswerEnding = 'complete' | 'refused' | 'truncated';

/**
 * The page a provider wrote, once it has stopped: its text, read as the
 * JSON it was asked for — or the reason there is no page.
 *
 * Each adapter speaks its own protocol up to here (Claude's stop reason,
 * an OpenAI finish reason and refusal field) and hands over the same two
 * things; what they mean is decided once. The two adapters had the same
 * twenty-five lines each, and a third would have been a third copy.
 */
export function readProviderAnswer(
  text: string,
  ending: ProviderAnswerEnding,
): unknown {
  if (ending === 'refused') throw new PageGenerationFailedError('refused');
  if (ending === 'truncated') throw new PageGenerationFailedError('truncated');
  try {
    return JSON.parse(text);
  } catch {
    throw new PageGenerationFailedError('not-json');
  }
}

/**
 * Why a provider that answered with this HTTP status gave no page: the key
 * it turned down, a limit reached, or anything else on its side. Claude's
 * SDK errors carry the same statuses as a plain HTTP answer.
 */
export function failureOfProviderStatus(
  status: number | undefined,
): PageGenerationFailure {
  if (status === 401 || status === 403) return 'rejected-credentials';
  if (status === 429) return 'rate-limited';
  return 'unreachable';
}

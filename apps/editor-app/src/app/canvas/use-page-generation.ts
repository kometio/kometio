import { useCallback, useEffect, useRef, useState } from 'react';
import type { PageGenerationFailure } from '@kometio/shared-types';
import type { GeneratePageRequest } from '@kometio/api-contracts';
import { ApiError } from '../../lib/http-client';
import {
  generatePage,
  PageGenerationError,
  type GeneratedPageResult,
} from '../../lib/page-generation-api-client';

/** Every reason a generation gave no page: the server's, and the ones only the browser sees. */
export type GenerationFailure =
  PageGenerationFailure | 'too-many-requests' | 'timed-out' | 'unexpected';

export type GenerationState =
  | { kind: 'idle' }
  | { kind: 'generating'; received: number }
  | { kind: 'failed'; failure: GenerationFailure };

/**
 * One generation at a time, cancellable. Leaving — closing the dialog,
 * leaving the page — aborts it, and the server cancels the provider with
 * it: nobody pays for a page nobody will read.
 */
export function usePageGeneration(siteId: string) {
  const [state, setState] = useState<GenerationState>({ kind: 'idle' });
  const running = useRef<AbortController | null>(null);

  useEffect(() => () => running.current?.abort(), []);

  const start = useCallback(
    async (input: GeneratePageRequest): Promise<GeneratedPageResult | null> => {
      running.current?.abort();
      const controller = new AbortController();
      running.current = controller;
      setState({ kind: 'generating', received: 0 });
      try {
        const page = await generatePage(siteId, input, {
          signal: controller.signal,
          onProgress: (received) => setState({ kind: 'generating', received }),
        });
        setState({ kind: 'idle' });
        return page;
      } catch (error) {
        if (!controller.signal.aborted) {
          setState({ kind: 'failed', failure: failureOf(error) });
        }
        return null;
      } finally {
        if (running.current === controller) running.current = null;
      }
    },
    [siteId],
  );

  const cancel = useCallback(() => {
    running.current?.abort();
    running.current = null;
    setState({ kind: 'idle' });
  }, []);

  return { state, start, cancel };
}

function failureOf(error: unknown): GenerationFailure {
  if (error instanceof PageGenerationError) return error.failure;
  if (error instanceof ApiError && error.status === 429) {
    return 'too-many-requests';
  }
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return 'timed-out';
  }
  return 'unexpected';
}

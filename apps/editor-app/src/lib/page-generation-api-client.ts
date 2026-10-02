import { type Block, type PageGenerationFailure } from '@kometio/shared-types';
import {
  generatePageEventSchema,
  pageGenerationRefusalSchema,
  pageGenerationStatusSchema,
  siteAiSettingsResponseSchema,
  siteAiSettingsViewSchema,
  type GeneratePageEvent,
  type GeneratePageRequest,
  type PageGenerationStatus,
  type SiteAiSettingsInput,
  type SiteAiSettingsResponse,
  type SiteAiSettingsView,
} from '@kometio/api-contracts';
import { API_BASE_URL, ApiError, request, send } from './http-client';
import {
  readServerSentEvents,
  type ServerSentEvent,
} from './server-sent-events';

export async function getAiSettings(
  siteId: string,
): Promise<SiteAiSettingsResponse> {
  return siteAiSettingsResponseSchema.parse(
    await request(`/sites/${siteId}/ai-settings`),
  );
}

export async function updateAiSettings(
  siteId: string,
  input: SiteAiSettingsInput,
): Promise<SiteAiSettingsView> {
  return siteAiSettingsViewSchema.parse(
    await request(`/sites/${siteId}/ai-settings`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  );
}

export function removeAiSettings(siteId: string): Promise<void> {
  return send(`/sites/${siteId}/ai-settings`, { method: 'DELETE' });
}

/** Whether "Generate with AI" can work here — readable by every editor. */
export async function getPageGenerationStatus(
  siteId: string,
): Promise<PageGenerationStatus> {
  return pageGenerationStatusSchema.parse(
    await request(`/sites/${siteId}/generate-page`),
  );
}

/** Why a generation gave no page, in the server's own words. */
export class PageGenerationError extends Error {
  constructor(public readonly failure: PageGenerationFailure) {
    super(`Page generation failed: ${failure}`);
    this.name = 'PageGenerationError';
  }
}

export interface GeneratedPageResult {
  content: Block[];
  /** Blocks the model wrote that could not be kept. */
  droppedCount: number;
  placeholderCount: number;
}

/**
 * A generation writes for a minute or two; the 20 s every other request
 * gets would cut it off. Past this the provider is not coming back.
 */
const GENERATION_TIMEOUT_MS = 5 * 60_000;

/**
 * Generates a page and reads the server's stream of events: `onProgress`
 * with the characters written so far, then the page — or a
 * `PageGenerationError` saying why there is none. Aborting `signal`
 * closes the stream, and the server cancels the provider with it.
 */
export async function generatePage(
  siteId: string,
  input: GeneratePageRequest,
  options: { onProgress?: (received: number) => void; signal?: AbortSignal },
): Promise<GeneratedPageResult> {
  const signals = [AbortSignal.timeout(GENERATION_TIMEOUT_MS)];
  if (options.signal) signals.push(options.signal);
  try {
    const response = await fetch(
      `${API_BASE_URL}/sites/${siteId}/generate-page`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: AbortSignal.any(signals),
      },
    );
    if (!response.ok || !response.body) {
      throw refusal(response.status, await response.json().catch(() => null));
    }

    for await (const raw of readServerSentEvents(response.body)) {
      const event = generationEvent(raw);
      switch (event?.event) {
        case 'progress':
          options.onProgress?.(event.data.received);
          break;
        case 'done':
          return {
            content: event.data.content,
            droppedCount: event.data.dropped.length,
            placeholderCount: event.data.placeholderCount,
          };
        case 'error':
          throw new PageGenerationError(event.data.failure);
      }
    }
  } catch (error) {
    // What is ours to say passes through; a timeout or a cancel keeps its
    // own name. Anything else is the connection failing — the fetch or a
    // read of the stream — which the person sees as "could not be
    // reached", not as an unexplained error.
    if (
      error instanceof PageGenerationError ||
      error instanceof ApiError ||
      error instanceof DOMException
    ) {
      throw error;
    }
    throw new PageGenerationError('unreachable');
  }
  // The stream ended without a page or a reason: the connection dropped.
  throw new PageGenerationError('unreachable');
}

/**
 * A generation the server refused before streaming — no provider, a key
 * that no longer opens, the site busy — names its failure in the body, as
 * the stream would: it is said the same way. Anything else stays the
 * HTTP error it is.
 */
function refusal(status: number, body: unknown): Error {
  const failure = pageGenerationRefusalSchema.safeParse(body);
  return failure.success
    ? new PageGenerationError(failure.data.message)
    : new ApiError(status, body);
}

/**
 * One event, checked. A frame that is not what the server writes is
 * skipped rather than allowed to end the whole stream: the page may
 * still arrive after it, and if it does not, the stream ends without one
 * and that is said.
 */
function generationEvent(raw: ServerSentEvent): GeneratePageEvent | null {
  let data: unknown;
  try {
    data = JSON.parse(raw.data);
  } catch {
    return null;
  }
  const parsed = generatePageEventSchema.safeParse({ event: raw.event, data });
  return parsed.success ? parsed.data : null;
}

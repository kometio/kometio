import type { GeneratedPage } from '@kometio/application';
import type { PageGenerationFailure } from '@kometio/shared-types';
import type { GeneratePageEvent } from '@kometio/api-contracts';

/** The part of Express's response a stream of events is written through. */
export interface EventStreamResponse {
  status(code: number): unknown;
  setHeader(name: string, value: string): unknown;
  flushHeaders(): void;
  write(chunk: string): boolean;
  end(): unknown;
  on(event: 'close', listener: () => void): unknown;
  readonly writableFinished: boolean;
}

/** A provider streams in small pieces; the editor only needs to see it move. */
const PROGRESS_STEP = 200;

/**
 * One generation's answer, as the server-sent events the editor reads
 * (`GeneratePageEvent`): `progress` every few hundred characters, then
 * `done` with the page or `error` with the failure's code. Opening the
 * stream sends its headers; `left` says when the person closed it first.
 */
export class PageGenerationStream {
  private readonly leaving = new AbortController();
  private reported = 0;

  constructor(private readonly response: EventStreamResponse) {
    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    // Nginx and similar proxies would otherwise hold the events back.
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();
    response.on('close', () => {
      if (!response.writableFinished) this.leaving.abort();
    });
  }

  /** Aborted when the person leaves before the page is sent. */
  get left(): AbortSignal {
    return this.leaving.signal;
  }

  progress(received: number): void {
    if (received - this.reported < PROGRESS_STEP) return;
    this.reported = received;
    this.send({ event: 'progress', data: { received } });
  }

  done(page: GeneratedPage): void {
    this.send({ event: 'done', data: page });
    this.response.end();
  }

  failed(failure: PageGenerationFailure): void {
    this.send({ event: 'error', data: { failure } });
    this.response.end();
  }

  private send({ event, data }: GeneratePageEvent): void {
    this.response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
}

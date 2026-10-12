import {
  captureException,
  close,
  dedupeIntegration,
  flush,
  initWithoutDefaultIntegrations,
  linkedErrorsIntegration,
} from '@sentry/node-core/light';
import type { ErrorReporterPort, ErrorReportContext } from '@kometio/ports';
import { scrubEvent } from './scrub-event';

export interface SentryErrorReporterOptions {
  dsn: string;
  environment: string;
  release?: string | undefined;
  /** Which part of Kometio is reporting: `api`, `public-site`. */
  service: string;
}

/**
 * `ErrorReporterPort` on the Sentry SDK, and on nothing else of it: no
 * auto-instrumentation of the HTTP server, no console capture, no
 * breadcrumbs, no tracing, no profiling, no session tracking. The SDK is
 * started without its default integrations, because each of those is
 * something it would learn about a visitor, and the two it needs are named.
 *
 * It is the process's reporter: the SDK keeps one client for the process,
 * which is how the API and the site each use it.
 */
export class SentryErrorReporter implements ErrorReporterPort {
  readonly enabled = true;

  constructor(options: SentryErrorReporterOptions) {
    initWithoutDefaultIntegrations({
      dsn: options.dsn,
      environment: options.environment,
      release: options.release,
      integrations: [
        // An error's `cause` chain, which is where a wrapped one says why.
        linkedErrorsIntegration(),
        // The same error reported twice, by two handlers on its way out.
        dedupeIntegration(),
      ],
      sendDefaultPii: false,
      maxBreadcrumbs: 0,
      sendClientReports: false,
      initialScope: { tags: { service: options.service } },
      beforeSend: scrubEvent,
    });
  }

  captureException(error: unknown, context: ErrorReportContext = {}): void {
    try {
      captureException(error, {
        level: context.fatal ? 'fatal' : 'error',
        tags: {
          ...(context.requestId ? { request_id: context.requestId } : {}),
          ...(context.method ? { http_method: context.method } : {}),
          ...(context.path ? { http_path: context.path } : {}),
        },
      });
    } catch {
      // A report that cannot be made is not a reason to fail the request
      // that was already failing.
    }
  }

  async flush(timeoutMs: number): Promise<void> {
    await flush(timeoutMs).catch(() => false);
  }

  /** For a test: ends the SDK's client, so the next one starts clean. */
  static async shutdown(): Promise<void> {
    await close(1000).catch(() => false);
  }
}

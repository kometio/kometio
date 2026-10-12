/**
 * Where an unexpected error happened, as far as it is safe to say. Nothing
 * here is the visitor's: no body, no header, no cookie, no query string.
 */
export interface ErrorReportContext {
  /** The request it happened in, to find the log lines of it by. */
  requestId?: string | undefined;
  method?: string | undefined;
  /** The path, never the query: a preview link carries its token there. */
  path?: string | undefined;
  /** True for the error that is about to end the process. */
  fatal?: boolean | undefined;
}

/**
 * Where an error nobody expected is sent, when the deployment has somewhere
 * to send it (docs/adr/0114). Implemented by
 * `@kometio/sentry-error-reporter`; a deployment with no `SENTRY_DSN` has
 * `noErrorReporter`, which sends nothing and starts nothing.
 *
 * Only an error that nobody handled is reported: a refused request, a
 * missing page, a domain rule that said no are the application working. An
 * implementation sends what it is given with the least it can: the
 * application hands over a context that has nothing of the visitor in it, and
 * the implementation removes what an error's own message may carry.
 */
export interface ErrorReporterPort {
  /** Whether anything is sent at all. */
  readonly enabled: boolean;
  /** Never throws, never waits: an error report is not worth a request. */
  captureException(error: unknown, context?: ErrorReportContext): void;
  /**
   * Sends what is queued, within `timeoutMs`. Resolves whether or not it all
   * went: for the moment before the process exits, where there is nothing to
   * do about a report that did not.
   */
  flush(timeoutMs: number): Promise<void>;
}

/** Reports nowhere: what a deployment with no DSN has. */
export const noErrorReporter: ErrorReporterPort = {
  enabled: false,
  captureException: () => undefined,
  flush: () => Promise.resolve(),
};

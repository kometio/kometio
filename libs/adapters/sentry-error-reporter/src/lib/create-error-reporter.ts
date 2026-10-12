import { noErrorReporter, type ErrorReporterPort } from '@kometio/ports';
import { SentryErrorReporter } from './sentry-error-reporter';

export interface ErrorReportingEnvironment {
  SENTRY_DSN?: string | undefined;
  SENTRY_ENVIRONMENT?: string | undefined;
  SENTRY_RELEASE?: string | undefined;
}

/**
 * A Sentry DSN has a public key as its user name and a project id as its
 * path: `https://<key>@<host>/<project>`. One that does not is refused at
 * start-up, with the variable's name: the SDK would take it, say nothing
 * and send nowhere, and a deployment would believe it was watched.
 */
export function assertSentryDsn(dsn: string): void {
  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    throw new Error(`SENTRY_DSN is not an address: ${JSON.stringify(dsn)}`);
  }
  const hasProject = /^\/(?:.*\/)?\d+$/.test(url.pathname);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !url.username ||
    !hasProject
  ) {
    throw new Error(
      'SENTRY_DSN is not a Sentry DSN: it looks like https://<key>@<host>/<project number>',
    );
  }
}

/**
 * What a deployment reports its errors to: Sentry when it gave a
 * `SENTRY_DSN`, nowhere when it did not. An empty value is "not set", as it
 * is for every optional variable (an image started with none passes an empty
 * string). Nothing is started, and nothing is sent, without a DSN.
 */
export function createErrorReporter(
  env: ErrorReportingEnvironment,
  service: string,
): ErrorReporterPort {
  const dsn = env.SENTRY_DSN?.trim();
  if (!dsn) return noErrorReporter;
  assertSentryDsn(dsn);
  return new SentryErrorReporter({
    dsn,
    environment: env.SENTRY_ENVIRONMENT?.trim() || 'production',
    release: env.SENTRY_RELEASE?.trim() || undefined,
    service,
  });
}

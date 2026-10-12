import { noErrorReporter, type ErrorReporterPort } from '@kometio/ports';
import { createErrorReporter } from '@kometio/sentry-error-reporter';

/**
 * Where this server reports an error nobody expected: Sentry when the
 * deployment gave a `SENTRY_DSN`, nowhere when it did not (docs/adr/0114).
 *
 * Read from `process.env` here, once, at start — not from
 * `import.meta.env` — for the reason `apiUrl()` is (public-api-client.ts):
 * one built image serves whichever deployment's variables it is started
 * with.
 *
 * A DSN that is not one does not take the site down. The API, which reads the
 * same variable, refuses to start on it and says which; this server is what
 * visitors reach, and a typo in where its errors go is not worth a page not
 * served. It says so in its own log, once.
 */
export function createSiteErrorReporter(
  env: NodeJS.ProcessEnv,
): ErrorReporterPort {
  try {
    return createErrorReporter(env, 'public-site');
  } catch (error) {
    console.error(
      `[error-reporting] ${error instanceof Error ? error.message : String(error)}. Errors are not being reported.`,
    );
    return noErrorReporter;
  }
}

export const errorReporter = createSiteErrorReporter(process.env);

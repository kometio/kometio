import type { ErrorReporterPort, ErrorReportContext } from '@kometio/ports';

/**
 * Runs `render` and, when it throws, reports the error before it goes on.
 *
 * Only what is thrown is reported: a page that is not there, a redirect and
 * a refused form are answers, and arrive here as responses. What is thrown
 * is a page's frontmatter that failed, or the API that did not answer
 * (docs/adr/0114).
 *
 * The error is rethrown as it was, so Astro still draws its own 500 page,
 * and a reporter that fails cannot change what the visitor is told.
 */
export async function reportErrors<T>(
  reporter: ErrorReporterPort,
  context: ErrorReportContext,
  render: () => Promise<T>,
): Promise<T> {
  try {
    return await render();
  } catch (error) {
    try {
      reporter.captureException(error, context);
    } catch {
      // A report that cannot be made is not a reason to hide the error.
    }
    throw error;
  }
}

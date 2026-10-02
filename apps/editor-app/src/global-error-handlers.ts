/**
 * Security review 2026-08-24, "third pass": no global `window.onerror` or
 * `unhandledrejection` — a throw outside a React error boundary (an
 * unhandled rejection, an error in a native event handler) vanished,
 * invisible even in production. No external error-tracking service is
 * configured (it needs the customer's account and DSN, out of scope here) —
 * so it logs to the console for now, as the single hook point for a future
 * Sentry.init()/captureException.
 */
export function setupGlobalErrorHandlers(): void {
  window.addEventListener('error', (event) => {
    console.error('[unhandled error]', event.error ?? event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[unhandled rejection]', event.reason);
  });
}

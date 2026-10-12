import { afterEach, describe, expect, it, vi } from 'vitest';
import { noErrorReporter } from '@kometio/ports';
import { createSiteErrorReporter } from './error-reporter';

describe('createSiteErrorReporter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports nowhere without a DSN', () => {
    expect(createSiteErrorReporter({})).toBe(noErrorReporter);
    expect(createSiteErrorReporter({ SENTRY_DSN: '' })).toBe(noErrorReporter);
  });

  it('keeps the site up when the DSN is not one, and says so in the log', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const reporter = createSiteErrorReporter({ SENTRY_DSN: 'not-a-dsn' });

    expect(reporter).toBe(noErrorReporter);
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0]?.[0])).toMatch(
      /SENTRY_DSN is not an address.*not being reported/,
    );
  });
});

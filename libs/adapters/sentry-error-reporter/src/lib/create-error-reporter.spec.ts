import { describe, expect, it } from 'vitest';
import { noErrorReporter } from '@kometio/ports';
import { assertSentryDsn, createErrorReporter } from './create-error-reporter';

describe('createErrorReporter', () => {
  it.each([undefined, '', '   '])(
    'reports nowhere, and starts nothing, for a DSN of %j',
    (dsn) => {
      expect(createErrorReporter({ SENTRY_DSN: dsn }, 'api')).toBe(
        noErrorReporter,
      );
    },
  );

  it('refuses a DSN that is not one, naming the variable', () => {
    expect(() =>
      createErrorReporter({ SENTRY_DSN: 'not an address' }, 'api'),
    ).toThrow(/SENTRY_DSN is not an address/);
    expect(() =>
      createErrorReporter(
        { SENTRY_DSN: 'https://sentry.example.test/1' },
        'api',
      ),
    ).toThrow(/SENTRY_DSN is not a Sentry DSN/);
  });
});

describe('assertSentryDsn', () => {
  it.each([
    'https://abc123@o1.ingest.de.sentry.io/4510000000',
    'http://key@127.0.0.1:9000/1',
    'https://key@sentry.example.test/prefix/42',
  ])('takes %s', (dsn) => {
    expect(() => assertSentryDsn(dsn)).not.toThrow();
  });

  it.each([
    'https://sentry.example.test/1',
    'https://key@sentry.example.test',
    'https://key@sentry.example.test/project',
    'ftp://key@sentry.example.test/1',
  ])('refuses %s', (dsn) => {
    expect(() => assertSentryDsn(dsn)).toThrow(/SENTRY_DSN/);
  });
});

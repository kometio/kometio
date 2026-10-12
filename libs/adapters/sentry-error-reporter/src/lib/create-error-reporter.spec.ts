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
    // ...and does not write what was typed into the message.
    let message = '';
    try {
      createErrorReporter({ SENTRY_DSN: 'key-1234 not an address' }, 'api');
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/SENTRY_DSN/);
    expect(message).not.toContain('key-1234');
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
    'http://key@localhost:9000/1',
    'http://key@[::1]:9000/1',
    'https://key@sentry.example.test/prefix/42',
  ])('takes %s', (dsn) => {
    expect(() => assertSentryDsn(dsn)).not.toThrow();
  });

  it('refuses plain http to a server that is not this machine: the report would cross the network in the clear', () => {
    expect(() => assertSentryDsn('http://key@sentry.example.test/1')).toThrow(
      /https/,
    );
    expect(() => assertSentryDsn('http://key@10.0.0.5:9000/1')).toThrow(
      /https/,
    );
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

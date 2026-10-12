import type { ErrorEvent } from '@sentry/node-core/light';
import { describe, expect, it } from 'vitest';
import { redact, scrubEvent } from './scrub-event';

/** What the SDK would hand over for an error in a request: everything it might attach. */
function richEvent(): ErrorEvent {
  return {
    type: undefined,
    event_id: 'abc',
    timestamp: 1,
    platform: 'node',
    level: 'error',
    environment: 'production',
    release: 'v1',
    server_name: 'kometio-host-1',
    tags: { service: 'api', request_id: 'r1' },
    user: { id: 'u1', email: 'ana@example.test', ip_address: '203.0.113.9' },
    request: {
      url: 'https://site.test/api/pages?token=secret',
      method: 'POST',
      headers: { cookie: 'kometio_session=abc', authorization: 'Bearer abc' },
      cookies: { kometio_session: 'abc' },
      data: { password: 'hunter2' },
      query_string: 'token=secret',
    },
    extra: { body: { email: 'ana@example.test' } },
    contexts: { device: { name: 'host' } },
    breadcrumbs: [{ message: 'GET /api/me' }],
    modules: { argon2: '1' },
    exception: {
      values: [
        {
          type: 'error',
          value:
            'duplicate key (email)=(ana@example.test) from https://x.test/p?token=abc Bearer eyJhbGciOi.def',
          stacktrace: {
            frames: [
              {
                filename: 'app.js',
                lineno: 3,
                vars: { password: 'hunter2' },
              },
            ],
          },
        },
      ],
    },
  };
}

describe('redact', () => {
  it('replaces an email address, the query of an address, and a bearer token', () => {
    expect(
      redact(
        'a@b.example failed on https://x.test/p/1?token=abc&q=1 with Bearer abc.def-1',
      ),
    ).toBe('[email] failed on https://x.test/p/1?[query] with Bearer [token]');
  });

  it('removes the values a failed query was run with, which Drizzle writes after the SQL', () => {
    expect(
      redact(
        'Failed query: insert into "users" ("email", "password_hash") values ($1, $2)\nparams: x@y.test,$argon2id$v=19$m=65536$abc',
      ),
    ).toBe(
      'Failed query: insert into "users" ("email", "password_hash") values ($1, $2)\nparams: [values]',
    );
  });

  it('leaves what carries nothing alone', () => {
    expect(redact('Cannot read properties of undefined (reading id)')).toBe(
      'Cannot read properties of undefined (reading id)',
    );
  });
});

describe('scrubEvent', () => {
  it('keeps the error, where it was and the tags', () => {
    const scrubbed = scrubEvent(richEvent());

    expect(scrubbed.tags).toEqual({ service: 'api', request_id: 'r1' });
    expect(scrubbed.level).toBe('error');
    expect(scrubbed.environment).toBe('production');
    expect(scrubbed.exception?.values?.[0]?.type).toBe('error');
    expect(scrubbed.exception?.values?.[0]?.stacktrace?.frames?.[0]).toEqual({
      filename: 'app.js',
      lineno: 3,
    });
  });

  it('removes what the SDK attached about the request, the person and the machine', () => {
    const scrubbed = scrubEvent(richEvent());

    for (const key of [
      'request',
      'user',
      'server_name',
      'extra',
      'contexts',
      'breadcrumbs',
      'modules',
    ]) {
      expect(scrubbed).not.toHaveProperty(key);
    }
  });

  it('redacts the words of the error', () => {
    const value = scrubEvent(richEvent()).exception?.values?.[0]?.value;

    expect(value).toBe(
      'duplicate key (email)=([email]) from https://x.test/p?[query] Bearer [token]',
    );
  });

  it('is a list of what to keep: a field it does not know does not travel', () => {
    const event = { ...richEvent(), brand_new_sdk_field: { secret: 1 } };

    expect(scrubEvent(event)).not.toHaveProperty('brand_new_sdk_field');
  });
});

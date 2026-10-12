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

  describe('what the first version of this let through', () => {
    it.each([
      [
        'the values of a failed query when they run over several lines',
        'Failed query: update "pages" set "content" = $1\nparams: line one\nline two with ana@x.test\n$argon2id$v=19$abc',
        'Failed query: update "pages" set "content" = $1\nparams: [values]',
      ],
      [
        'credentials inside a connection string',
        'connect failed: postgres://kometio_app:s3cret@db.internal:5432/kometio',
        'connect failed: postgres://[credentials]@db.internal:5432/kometio',
      ],
      [
        'the query of an address that is not absolute',
        'GET /api/public/pages/p1/preview?token=abc.def&x=1 failed',
        'GET /api/public/pages/p1/preview?[query] failed',
      ],
      [
        'the query of an address written in capitals',
        'HTTPS://x.test/p?token=abc',
        'HTTPS://x.test/p?[query]',
      ],
      [
        'an email address that has no top-level domain, or is not ASCII',
        'for ana@localhost and for andré@exämple.test',
        'for [email] and for [email]',
      ],
      [
        'an Authorization header of another scheme',
        'rejected: Authorization: Basic YW5hOnMzY3JldA==',
        'rejected: Authorization: Basic [token]',
      ],
      [
        'a JSON web token',
        'bad token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl',
        'bad token [token]',
      ],
      [
        'a password hash',
        'saved $argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$aGFzaGhhc2g and went on',
        'saved [hash] and went on',
      ],
      [
        'a long hexadecimal secret',
        'secret 3f9a1c5e7b2d4f6a8c0e1b3d5f7a9c2e4b6d8f0a1c3e5b7d9f1a3c5e7b9d1f3a',
        'secret [token]',
      ],
      [
        'a session cookie as it is written in a header',
        'cookie: kometio_session=abc123def456; theme=dark',
        'cookie: kometio_session=[token]; theme=dark',
      ],
    ])('redacts %s', (_name, text, expected) => {
      expect(redact(text)).toBe(expected);
    });

    it('keeps what is not a secret: an id, a status, a plain question', () => {
      const text =
        'page 3f9a1c5e-7b2d-4f6a-8c0e-1b3d5f7a9c2e not found (404): which one?';

      expect(redact(text)).toBe(text);
    });

    it('takes a bounded time on a message of any length: the cap is applied before the rules, which are not linear', () => {
      // 2 MB of one unbroken run, the worst case for a rule that scans
      // forward from every position. Before the cap this took minutes.
      const started = Date.now();

      redact('a'.repeat(2_000_000));
      redact('ab+.-'.repeat(400_000));
      redact('?a'.repeat(1_000_000));

      expect(Date.now() - started).toBeLessThan(1000);
    });

    it('cuts a very long message, after redacting it, not before', () => {
      const long = `${'x'.repeat(5000)} ana@example.test`;

      const redacted = redact(long);

      expect(redacted.length).toBeLessThanOrEqual(1001);
      const secretAtTheEdge = `${'y'.repeat(990)} Bearer abcdefghijklmnopqrstuvwxyz`;
      expect(redact(secretAtTheEdge)).not.toContain('abcdefghij');
    });
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

  it('redacts the type of an exception too: a name is whatever the code that threw it set', () => {
    const event = richEvent();
    const [value] = event.exception?.values ?? [];
    if (!value) throw new Error('fixture');
    value.type = 'ValidationError for ana@example.test';

    expect(scrubEvent(event).exception?.values?.[0]?.type).toBe(
      'ValidationError for [email]',
    );
  });

  it('redacts the tags too: a path or a request id is whatever the caller said', () => {
    const event = richEvent();
    event.tags = {
      service: 'api',
      http_path: '/api/users/ana@example.test',
      request_id: 'Bearer abcdefghijklmnop',
    };

    expect(scrubEvent(event).tags).toEqual({
      service: 'api',
      http_path: '/api/users/[email]',
      request_id: 'Bearer [token]',
    });
  });

  it('keeps of an exception only its type, its text and the places in the code', () => {
    const event = richEvent();
    const [value] = event.exception?.values ?? [];
    if (!value) throw new Error('fixture');
    Object.assign(value, {
      mechanism: { type: 'generic', handled: false, data: { body: 'x' } },
      module: 'user-module',
      thread_id: 1,
    });
    const frame = value.stacktrace?.frames?.[0];
    if (!frame) throw new Error('fixture');
    Object.assign(frame, {
      context_line: 'const password = "hunter2";',
      pre_context: ['const a = 1;'],
      post_context: ['const b = 2;'],
      abs_path: '/app/dist/main.js',
      function: 'handle',
      in_app: true,
      colno: 7,
    });

    const [kept] = scrubEvent(event).exception?.values ?? [];

    expect(Object.keys(kept ?? {}).sort()).toEqual([
      'mechanism',
      'stacktrace',
      'type',
      'value',
    ]);
    expect(kept?.mechanism).toEqual({ type: 'generic', handled: false });
    expect(kept?.stacktrace?.frames?.[0]).toEqual({
      filename: 'app.js',
      abs_path: '/app/dist/main.js',
      function: 'handle',
      lineno: 3,
      colno: 7,
      in_app: true,
    });
  });

  it('is a list of what to keep: a field it does not know does not travel', () => {
    const event = { ...richEvent(), brand_new_sdk_field: { secret: 1 } };

    expect(scrubEvent(event)).not.toHaveProperty('brand_new_sdk_field');
  });
});

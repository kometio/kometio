import type { ErrorEvent } from '@sentry/node-core/light';
import { describe, expect, it } from 'vitest';
import { MAX_REDACTED_INPUT_LENGTH, redact, scrubEvent } from './scrub-event';

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
            'duplicate key (email)=(ana@example.test) from https://x.test/p?token=abc, Bearer eyJhbGciOi.def',
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

describe('redact: what is kept is what is safe', () => {
  it.each([
    "Cannot read properties of undefined (reading 'id')",
    'Request failed with status code 502',
    'TypeError: x is not a function',
    'Unexpected end of JSON input',
    'ECONNREFUSED: connection refused',
    'Cannot find module',
    "it's a plain sentence, with punctuation; and a question?",
    'Failed query: insert into "users" ("email", "password_hash") values',
  ])('keeps a plain message: %s', (message) => {
    expect(redact(message)).toBe(message);
  });

  it('keeps what is useful about a message with something in it that is not safe', () => {
    expect(
      redact('connect ECONNREFUSED 127.0.0.1:5999 while reading page'),
    ).toBe('connect ECONNREFUSED … while reading page');
  });

  it.each([
    ['an email address', 'for ana@example.test please', 'ana@example.test'],
    ['an address without a top-level domain', 'ana@localhost', 'ana@localhost'],
    ['a non-ASCII address', 'andré@exämple.test', 'exämple'],
    ['a percent-encoded address', 'GET /u/ana%40example.test', 'example'],
    ['a double-encoded address', 'GET /u/ana%2540example.test', 'example'],
    [
      'four layers of encoding',
      'GET /u/ana%252525252540example.test',
      'example',
    ],
    ['a JSON escape', 'bad "ana\\u0040example.test"', 'example'],
    ['a numeric entity', 'bad ana&#64;example.test', 'example'],
    ['a named entity', 'bad ana&commat;example.test', 'example'],
    ['a full-width at sign', 'bad ana＠example.test', 'example'],
    [
      'a zero-width space in a secret',
      'secret abcdef​0123456789',
      '0123456789',
    ],
    ['a control character', 'bad ana\u0007@example.test', 'example'],
    [
      'an address with a query',
      'GET /api/p/1?token=abc.def&x=1 failed',
      'token',
    ],
    ['an absolute address', 'fetch https://x.test/p/1 failed', 'x.test'],
    ['the same in capitals', 'HTTPS://X.TEST/P?TOKEN=ABC', 'X.TEST'],
    [
      'a connection string',
      'postgres://app:s3cret@db.internal:5432/kometio',
      's3cret',
    ],
    [
      'a JSON web token',
      'bad eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln',
      'eyJ',
    ],
    [
      'a password hash',
      'saved $argon2id$v=19$m=65536,t=3,p=4$c29tZQ$aGFzaA',
      'argon2',
    ],
    [
      'a long hexadecimal secret',
      'secret 3f9a1c5e7b2d4f6a8c0e1b3d5f7a9c2e4b6d8f0a',
      '3f9a1c5e',
    ],
    ['a cookie', 'cookie: kometio_session=abc123def456; theme=dark', 'abc123'],
    [
      'a key=value pair',
      'connect failed host=db user=app password=s3cret x',
      's3cret',
    ],
    ['a number of eight digits', 'phone 0612345678 invalid', '0612345678'],
    ['a word that is not one', 'weird Zm9vYmFyYmF6cXV4IGtleQ==', 'Zm9v'],
  ])('does not keep %s', (_name, text, secret) => {
    const redacted = redact(text);

    expect(redacted).not.toContain(secret);
  });

  it('keeps the words around what it does not keep', () => {
    expect(redact('could not send mail to ana@example.test now')).toBe(
      'could not send mail to … now',
    );
  });

  describe('what is made of plain words and is only given away by its name', () => {
    it.each([
      [
        'a quoted value with spaces in JSON',
        'bad body {"email": "x", "password": "hunter with spaces", "n": 1}',
        'hunter',
      ],
      [
        'a password written plainly',
        'login failed password=hunter user',
        'hunter',
      ],
      ['an api key header', 'sent X-Api-Key: abcdef and more', 'abcdef'],
      [
        'a bearer credential of letters only',
        'rejected Bearer abcdefghijklmnop',
        'abcdefghij',
      ],
      ['a basic credential', 'Authorization: Basic YWJjZGVm', 'YWJjZGVm'],
      [
        'a name that ends in the keyword',
        'access_token=abcdefghij',
        'abcdefghij',
      ],
      ['a camel-cased name', 'refreshToken: "abc def"', 'abc'],
    ])('does not keep %s', (_name, text, secret) => {
      expect(redact(text)).not.toContain(secret);
    });

    it('removes the values a failed query was run with, to the end, whatever the case', () => {
      const text =
        'Failed query: update "pages" set "content" = $1\nParams : line one\nline two\n$argon2id$abc';

      expect(redact(text)).toBe(
        'Failed query: update "pages" set "content" …\nparams: [values]',
      );
    });
  });

  describe('bounds', () => {
    it('takes a bounded time on a message of any length', () => {
      const started = Date.now();

      redact('a'.repeat(2_000_000));
      redact('ab+.-'.repeat(400_000));
      redact('?a'.repeat(1_000_000));
      redact('a@'.repeat(500_000));
      redact('token '.repeat(300_000));

      expect(Date.now() - started).toBeLessThan(1000);
    });

    it('cuts a very long message at a word, and keeps the start', () => {
      const redacted = redact('word '.repeat(600));

      expect(redacted.length).toBeLessThanOrEqual(1001);
      expect(redacted.startsWith('word word')).toBe(true);
      expect(redacted).toMatch(/word…$/);
    });

    it('never leaves half a secret where the input is cut: the word at the cut is dropped whole', () => {
      const secret =
        '3f9a1c5e7b2d4f6a8c0e1b3d5f7a9c2e4b6d8f0a1c3e5b7d9f1a3c5e7b9d1f3a';
      const input = `${'w '.repeat((MAX_REDACTED_INPUT_LENGTH - 11) / 2)} ${secret} tail`;

      expect(redact(input)).not.toMatch(/[0-9a-f]{8}/);
    });

    it('does not keep a run longer than any word of a message: it is data', () => {
      const blob = 'x'.repeat(5000);

      expect(redact(`failed to parse ${blob} at line 3`)).toBe(
        'failed to parse … at line 3',
      );
    });

    it('is a gap, not several, where several words in a row were not kept', () => {
      expect(redact('a b@c d@e f@g h')).toBe('a … h');
    });

    it('does not throw on what is not a string', () => {
      // What an event from a library that did not follow its own types holds.
      // @ts-expect-error -- not a string
      expect(redact(undefined)).toBe('');
      // @ts-expect-error -- not a string
      expect(redact(42)).toBe('');
    });
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

  it('keeps the words of the error that are safe and nothing else', () => {
    const value = scrubEvent(richEvent()).exception?.values?.[0]?.value;

    expect(value).toBe('duplicate key … from … Bearer [redacted]');
  });

  it('redacts the type of an exception as it redacts its text', () => {
    const event = richEvent();
    const [value] = event.exception?.values ?? [];
    if (!value) throw new Error('fixture');
    value.type = 'ValidationError for ana@example.test';

    expect(scrubEvent(event).exception?.values?.[0]?.type).toBe(
      'ValidationError for …',
    );
  });

  describe('the tags', () => {
    it('keeps a path of slugs and ids, and masks a segment that is not one', () => {
      const event = richEvent();
      event.tags = {
        http_path:
          '/api/users/ana%40example.test/pages/3f9a1c5e-7b2d-4f6a-8c0e-1b3d5f7a9c2e',
      };

      expect(scrubEvent(event).tags).toEqual({
        http_path: '/api/users/…/pages/3f9a1c5e-7b2d-4f6a-8c0e-1b3d5f7a9c2e',
      });
    });

    it('masks a request id that is whatever the client said it was', () => {
      const event = richEvent();
      event.tags = { request_id: 'Bearer abcdefghijklmnop' };

      expect(scrubEvent(event).tags).toEqual({ request_id: '…' });
    });

    it('masks a method that is not one', () => {
      const event = richEvent();
      event.tags = { http_method: 'GET ana@example.test' };

      expect(scrubEvent(event).tags).toEqual({ http_method: '…' });
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

  describe('the places in the code are held to what a place in the code is', () => {
    const keptFrame = (frame: Record<string, unknown>) => {
      const event = richEvent();
      event.exception = {
        values: [
          { type: 'Error', value: 'x', stacktrace: { frames: [frame] } },
        ],
      };
      return scrubEvent(event).exception?.values?.[0]?.stacktrace?.frames?.[0];
    };

    it('keeps a file, a module and a function as they are written', () => {
      expect(
        keptFrame({
          filename: 'file:///app/dist/main.js',
          abs_path: '/app/node_modules/@sentry/core/build/cjs/index.js',
          module: '@sentry/core',
          function: 'Object.<anonymous>',
        }),
      ).toEqual({
        filename: 'file:///app/dist/main.js',
        abs_path: '/app/node_modules/@sentry/core/build/cjs/index.js',
        module: '@sentry/core',
        function: 'Object.<anonymous>',
      });
    });

    it('does not keep what is not one: an address with a query, or an email in a name', () => {
      expect(
        keptFrame({
          filename: 'https://x.test/a.js?token=abc',
          abs_path: '/srv/ana@example.test/main.js',
          function: 'handler for ana@example.test',
        }),
      ).toEqual({});
    });
  });

  it('keeps the environment and the release only if they are names', () => {
    const event = richEvent();
    event.environment = 'production';
    event.release = 'ana@example.test';

    const scrubbed = scrubEvent(event);

    expect(scrubbed.environment).toBe('production');
    expect(scrubbed).not.toHaveProperty('release');
  });

  it('keeps the innermost frames and a bounded number of exceptions', () => {
    const event = richEvent();
    const frames = Array.from({ length: 300 }, (_, index) => ({
      filename: `f${index}.js`,
      lineno: index,
    }));
    event.exception = {
      values: Array.from({ length: 30 }, () => ({
        type: 'Error',
        value: 'x',
        stacktrace: { frames },
      })),
    };

    const { values } = scrubEvent(event).exception ?? {};

    expect(values).toHaveLength(10);
    expect(values?.[0]?.stacktrace?.frames).toHaveLength(100);
    expect(values?.[0]?.stacktrace?.frames?.at(-1)?.filename).toBe('f299.js');
  });

  it('is a list of what to keep: a field it does not know does not travel', () => {
    const event = { ...richEvent(), brand_new_sdk_field: { secret: 1 } };

    expect(scrubEvent(event)).not.toHaveProperty('brand_new_sdk_field');
  });
});

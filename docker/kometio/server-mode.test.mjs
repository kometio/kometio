import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseDomain, serverAddresses } from './server-mode.mjs';

describe('parseDomain', () => {
  it('takes a name, and forgives case, spaces and a trailing dot', () => {
    assert.equal(parseDomain('example.com'), 'example.com');
    assert.equal(parseDomain('  Example.COM. '), 'example.com');
    assert.equal(parseDomain('my-site.example.co.uk'), 'my-site.example.co.uk');
    assert.equal(parseDomain('kometio.localhost'), 'kometio.localhost');
  });

  for (const [value, problem] of [
    ['', /is empty/],
    ['https://example.com', /scheme/],
    ['http://example.com/', /scheme/],
    ['example.com:8443', /port/],
    ['example.com/admin', /more than a name/],
    ['user@example.com', /more than a name/],
    ['two names.com', /more than a name/],
    ['localhost', /single word/],
    ['example', /single word/],
    ['-bad.example.com', /not a hostname/],
    ['bad-.example.com', /not a hostname/],
    ['under_score.example.com', /not a hostname/],
    ['a..example.com', /not a hostname/],
    ['203.0.113.7', /IP address/],
    ['a'.repeat(64) + '.example.com', /not a hostname/],
  ]) {
    it(`refuses ${JSON.stringify(value)}, saying what to write`, () => {
      assert.throws(
        () => parseDomain(value),
        (error) => {
          assert.match(error.message, problem);
          assert.match(error.message, /like example\.com/);
          return true;
        },
      );
    });
  }
});

describe('serverAddresses', () => {
  it('puts the site at the name and the editor and the API one level below, over HTTPS', () => {
    assert.deepEqual(serverAddresses('example.com'), {
      siteUrl: 'https://example.com',
      editorUrl: 'https://admin.example.com',
      apiPublicUrl: 'https://api.example.com/api',
    });
  });
});

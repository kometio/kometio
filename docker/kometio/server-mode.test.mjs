import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseDomain,
  resolveAddresses,
  serverAddresses,
} from './server-mode.mjs';

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

describe('resolveAddresses', () => {
  it('is a trial on this machine, on its own ports, with nothing set', () => {
    assert.deepEqual(resolveAddresses({}), {
      domain: null,
      editorUrl: 'http://localhost:4200',
      apiPublicUrl: 'http://localhost:3000/api',
      siteUrl: 'http://localhost:4322',
    });
  });

  it('is what the name makes, with a name', () => {
    assert.deepEqual(resolveAddresses({ DOMAIN: 'Example.com' }), {
      domain: 'example.com',
      editorUrl: 'https://admin.example.com',
      apiPublicUrl: 'https://api.example.com/api',
      siteUrl: 'https://example.com',
    });
  });

  it('lets an address set by hand win over the name, one at a time', () => {
    const resolved = resolveAddresses({
      DOMAIN: 'example.com',
      PUBLIC_SITE_URL: 'https://www.example.com',
    });
    assert.equal(resolved.siteUrl, 'https://www.example.com');
    assert.equal(resolved.editorUrl, 'https://admin.example.com');
  });

  it('takes an empty DOMAIN for none, as an example file leaves it', () => {
    assert.equal(resolveAddresses({ DOMAIN: '  ' }).domain, null);
  });

  it('refuses a DOMAIN that is a mistake, saying what to write', () => {
    assert.throws(
      () => resolveAddresses({ DOMAIN: 'https://example.com' }),
      /like example\.com/,
    );
  });
});

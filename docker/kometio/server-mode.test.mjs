import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseDomain,
  proxyAdvice,
  proxyDefaults,
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

describe('proxyDefaults', () => {
  const at = (
    editorUrl,
    siteUrl = 'http://localhost:4322',
    apiPublicUrl = 'http://localhost:3000/api',
  ) => ({ editorUrl, siteUrl, apiPublicUrl });

  it('is a trial on this machine when every address is plain HTTP: development, and nobody in front', () => {
    assert.deepEqual(
      proxyDefaults({ domain: null, ...at('http://localhost:4200') }),
      { nodeEnv: 'development', trustedProxyHops: undefined },
    );
  });

  it('is a server with a name: production, and one proxy, which is Caddy inside the container', () => {
    assert.deepEqual(
      proxyDefaults({
        domain: 'example.com',
        ...at('https://admin.example.com'),
      }),
      { nodeEnv: 'production', trustedProxyHops: '1' },
    );
  });

  // Behind a proxy of one's own that ends the TLS: the browser is on https and
  // this container is on plain HTTP. The cookie has to be `Secure`. The proxy's
  // header is not trusted by that: nothing here knows that the proxy is the only
  // way in, and where it is not, whoever connects writes the header.
  it('is production, and trusts nobody, when the addresses are https and there is no name', () => {
    for (const addresses of [
      at('https://admin.example.com'),
      at('http://localhost:4200', 'https://example.com'),
      at(
        'http://localhost:4200',
        'http://localhost:4322',
        'https://api.example.com/api',
      ),
    ]) {
      assert.deepEqual(proxyDefaults({ domain: null, ...addresses }), {
        nodeEnv: 'production',
        trustedProxyHops: undefined,
      });
    }
  });
});

describe('proxyAdvice', () => {
  const https = {
    domain: null,
    editorUrl: 'https://admin.example.com',
    siteUrl: 'https://example.com',
    apiPublicUrl: 'https://api.example.com/api',
  };

  it('says what to set when the addresses are https, there is no name, and nobody said how many proxies', () => {
    assert.match(
      proxyAdvice({ ...https, trustedProxyHops: undefined }),
      /TRUSTED_PROXY_HOPS=1/,
    );
    assert.match(
      proxyAdvice({ ...https, trustedProxyHops: '  ' }),
      /five tries/,
    );
  });

  it('says nothing when it was said, when there is a name, or on a trial', () => {
    assert.equal(proxyAdvice({ ...https, trustedProxyHops: '2' }), null);
    assert.equal(
      proxyAdvice({
        ...https,
        domain: 'example.com',
        trustedProxyHops: undefined,
      }),
      null,
    );
    assert.equal(
      proxyAdvice({
        domain: null,
        editorUrl: 'http://localhost:4200',
        siteUrl: 'http://localhost:4322',
        apiPublicUrl: 'http://localhost:3000/api',
        trustedProxyHops: undefined,
      }),
      null,
    );
  });
});

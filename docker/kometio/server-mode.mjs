// What `DOMAIN` means to the single image (docs/adr/0104): the name a server
// is reached by, from which the three addresses of the stack follow. Pure, so
// that it can be tested without a container; the launcher does the rest.

const LABEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/**
 * `DOMAIN` as the hostname it must be, or an error that says what to write.
 *
 * Written the way people write an address, so it forgives what is only
 * decoration (case, a trailing dot) and refuses what would make three
 * hostnames out of a mistake (a scheme, a port, a path) rather than guessing:
 * the certificates are issued for what is here, and a wrong one is a failed
 * issuance and a retry limit at the certificate authority.
 */
export function parseDomain(value) {
  const domain = value.trim().toLowerCase().replace(/\.$/, '');
  const mistake = (problem) =>
    new Error(
      `DOMAIN=${value} ${problem}: write the name alone, like example.com (the editor is then at admin.example.com and the API at api.example.com)`,
    );
  if (domain === '') throw mistake('is empty');
  if (domain.includes('://'))
    throw mistake('has a scheme (http:// or https://)');
  if (/[\s/?#@]/.test(domain)) throw mistake('has more than a name in it');
  if (domain.includes(':')) throw mistake('has a port');
  if (domain.length > 253) throw mistake('is too long');
  const labels = domain.split('.');
  if (labels.length < 2) {
    throw mistake(
      'is a single word, not a name you can have a certificate for',
    );
  }
  if (!labels.every((label) => label.length <= 63 && LABEL.test(label))) {
    throw mistake('is not a hostname');
  }
  // 203.0.113.7 has the shape of a hostname and is none: no certificate
  // authority issues for it, and `admin.` in front of it is not an address.
  if (/^\d+$/.test(labels[labels.length - 1])) {
    throw mistake('is an IP address, not a name');
  }
  return domain;
}

/**
 * The three addresses a browser uses on a server with a name: the site at the
 * name itself, the editor and the API one level below, as in the compose stack
 * (docs/adr/0042). All HTTPS, which is the point of giving a name.
 */
export function serverAddresses(domain) {
  return {
    siteUrl: `https://${domain}`,
    editorUrl: `https://admin.${domain}`,
    apiPublicUrl: `https://api.${domain}/api`,
  };
}

/**
 * Where the browser reaches each half of this installation, from its
 * environment: the three addresses a person set by hand, else the ones a name
 * (`DOMAIN`) makes, else the ones of a trial on this machine's own ports. What is
 * set by hand wins, whatever DOMAIN says, as it does behind a proxy of one's own.
 * `domain` is the name the server was given, or null on a trial. It throws, with
 * what to write, when DOMAIN is a mistake.
 */
export function resolveAddresses(env) {
  const domain = env.DOMAIN?.trim() ? parseDomain(env.DOMAIN) : null;
  const served = domain ? serverAddresses(domain) : null;
  return {
    domain,
    editorUrl:
      env.EDITOR_APP_URL ?? served?.editorUrl ?? 'http://localhost:4200',
    apiPublicUrl:
      env.API_PUBLIC_URL ?? served?.apiPublicUrl ?? 'http://localhost:3000/api',
    siteUrl: env.PUBLIC_SITE_URL ?? served?.siteUrl ?? 'http://localhost:4322',
  };
}

/**
 * The ports the parts of the image answer on, inside it: the API and the site
 * always on the same, the editor on 80 where nothing else has it, and, on a
 * server with a name, on 8080 because Caddy has 80. One place, for the launcher
 * that starts them and the healthcheck that looks at them.
 */
export function innerPorts(domain) {
  return {
    api: 3000,
    site: 4322,
    editor: domain ? 8080 : 80,
    proxy: domain ? 80 : null,
  };
}

/** Whether an address says that the TLS is ended somewhere in front of this container. */
const isHttps = (address) => /^https:\/\//i.test(address);

/**
 * What the API is told about whoever stands in front of it, when nobody said.
 *
 * A server with a name has Caddy in front, inside this container, which is the
 * only way in: the API is `production` (the login cookie is `Secure`, example
 * secrets are refused) and trusts one hop, so that a visitor is who Caddy says.
 *
 * An installation behind a proxy of one's own that ends the TLS shows as an
 * address that is `https` while this container answers plain HTTP. It is
 * `production` too: a cookie that is not `Secure` on a page on HTTPS is wrong
 * whoever is in front. But the hop is **not** trusted for it. Trusting the
 * proxy's `X-Forwarded-For` is right only when nobody can reach the three ports
 * but that proxy, and the ports are published on every address by default: from
 * outside, this cannot tell. Where the proxy is not the only way in, whoever
 * connects directly writes the header, and every try at the login counts as
 * another visitor. So it is the owner's to say, with `TRUSTED_PROXY_HOPS`
 * (`proxyAdvice` says so in the log).
 *
 * A trial on this machine, plain HTTP in every address, is `development` with
 * nobody in front, as it always was. `NODE_ENV` set by hand wins.
 */
export function proxyDefaults({ domain, editorUrl, siteUrl, apiPublicUrl }) {
  const behindTls =
    domain !== null || [editorUrl, siteUrl, apiPublicUrl].some(isHttps);
  return {
    nodeEnv: behindTls ? 'production' : 'development',
    trustedProxyHops: domain !== null ? '1' : undefined,
  };
}

/**
 * What to say in the log when the addresses are https, with no name, and nobody
 * said how many proxies there are: every visitor is then the proxy, and one
 * person can use up the login's five tries a minute for everybody. Null when
 * there is nothing to say.
 */
export function proxyAdvice({
  domain,
  editorUrl,
  siteUrl,
  apiPublicUrl,
  trustedProxyHops,
}) {
  const behindTls =
    domain === null &&
    [editorUrl, siteUrl, apiPublicUrl].some(isHttps) &&
    !trustedProxyHops?.trim();
  return behindTls
    ? 'the addresses are https and TRUSTED_PROXY_HOPS is not set: every visitor looks like your proxy, and the login allows five tries a minute for all of them together. If your proxy is the only way to reach the three ports, set -e TRUSTED_PROXY_HOPS=1 (2 with a CDN in front of it); if they can be reached directly, leave it unset, since anyone could then write the header themselves'
    : null;
}

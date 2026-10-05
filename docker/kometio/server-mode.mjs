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

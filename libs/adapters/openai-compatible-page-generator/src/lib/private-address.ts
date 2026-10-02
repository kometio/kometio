import { lookup as dnsLookup } from 'node:dns';
import { BlockList, isIP, type LookupFunction } from 'node:net';

/**
 * Addresses inside a network rather than on the internet: this machine,
 * private ranges, link-local (where cloud metadata answers), and the ones
 * reserved for nothing a model server should be. A server the admin names
 * is reached from inside the API's own network; unless the operator says
 * so, it may not be one of these.
 */
const PRIVATE = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  PRIVATE.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  PRIVATE.addSubnet(network, prefix, 'ipv6');
}

export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return PRIVATE.check(address, 'ipv4');
  if (family !== 6) return false;
  // An IPv4 address written as IPv6 is still that IPv4 address.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
  return mapped
    ? PRIVATE.check(mapped, 'ipv4')
    : PRIVATE.check(address, 'ipv6');
}

/** A server whose address is inside the network, where it may not be reached. */
export class PrivateAddressRefusedError extends Error {
  constructor(host: string) {
    super(`Refused to reach ${host}: it resolves inside the network.`);
    this.name = 'PrivateAddressRefusedError';
  }
}

/**
 * `dns.lookup`, refusing a name that resolves inside the network. Used at
 * the moment of connecting, not before it: a name checked first and
 * resolved again to connect could answer differently the second time.
 * Handles both shapes Node asks for — one address, or all of them when it
 * races IPv4 against IPv6.
 */
export const publicOnlyLookup: LookupFunction = (
  hostname,
  options,
  callback,
) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) {
      callback(error, '', 0);
      return;
    }
    if (addresses.some((entry) => isPrivateAddress(entry.address))) {
      callback(new PrivateAddressRefusedError(hostname), '', 0);
      return;
    }
    if (options.all) {
      callback(null, addresses);
      return;
    }
    const [first] = addresses;
    callback(null, first?.address ?? '', first?.family ?? 0);
  });
};

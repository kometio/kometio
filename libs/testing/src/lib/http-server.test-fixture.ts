import type { Server } from 'node:net';

/**
 * The port a spec's own server was given when it listened on 0. `address()`
 * is also a path (a socket) or `null` (not listening); a spec that builds a
 * URL from it is relying on neither, and this says so.
 */
export function portOf(server: Pick<Server, 'address'>): number {
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('The server is not listening on a port');
  }
  return address.port;
}

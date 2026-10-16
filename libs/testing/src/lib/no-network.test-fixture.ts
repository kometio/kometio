import net from 'node:net';

/**
 * A suite that is meant to run on one machine and quietly talks to another
 * one is a flaky suite waiting for the other one's bad minute.
 *
 * It has been seen: the login a suite used asked Cloudflare, over the
 * network, whether a test token was good. In one run four tests of one
 * suite answered 500 and the next run passed, and the only call on that path
 * that could throw was the one to Cloudflare. Nothing in the failure said that
 * the network was involved. The captcha is local now; this is what keeps the
 * next one from hiding.
 *
 * `blockNetwork()` makes every connection to a machine other than this one
 * fail, whoever opens it (`fetch`, `pg`, an SDK's own client: they all end in
 * a socket), and remembers the attempt. The failure the caller sees is a
 * network error, which production code is written to handle and may well turn
 * into a 500 or an empty list; that is why `assertNoNetworkAttempts()` fails
 * the test with the address that was asked for, whatever the code under test
 * did with the refusal.
 */

/** The address a test asked for and was refused. */
export class NetworkAttemptError extends Error {
  constructor(readonly target: string) {
    super(
      `A test tried to reach ${target}. Tests run on this machine only: ` +
        'replace what talks to it with a fake (libs/testing).',
    );
    this.name = 'NetworkAttemptError';
  }
}

const attempts: string[] = [];
let installed = false;

function isThisMachine(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, '').toLowerCase();
  return (
    bare === 'localhost' ||
    bare.endsWith('.localhost') ||
    bare === '::1' ||
    /^127(?:\.\d{1,3}){3}$/.test(bare)
  );
}

/**
 * What `socket.connect()` was asked for, in the shapes Node accepts: an
 * options object, a path (a Unix socket, always this machine), or a port with
 * an optional host. Node's own `net.connect()` does not call it with any of
 * those but with the arguments already normalised, an array whose first
 * element is the options: the usual way in, and the one a guard that only
 * looked at the documented shapes would let through.
 */
function targetOf(args: readonly unknown[]): string | null {
  const [first, second] = args;
  const options = Array.isArray(first) ? first[0] : first;
  if (typeof options === 'object' && options !== null) {
    if ('path' in options && typeof options.path === 'string') return null;
    const host = 'host' in options ? options.host : undefined;
    const port = 'port' in options ? options.port : undefined;
    return addressOf(host, port);
  }
  if (typeof options === 'string' && Number.isNaN(Number(options))) return null;
  return addressOf(typeof second === 'string' ? second : undefined, options);
}

function addressOf(host: unknown, port: unknown): string | null {
  const name = typeof host === 'string' && host !== '' ? host : 'localhost';
  if (isThisMachine(name)) return null;
  return typeof port === 'number' || typeof port === 'string'
    ? `${name}:${port}`
    : name;
}

/** Idempotent: a suite's setup file may run once per test file in the same process. */
export function blockNetwork(): void {
  if (installed) return;
  installed = true;

  const connect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (
    this: net.Socket,
    ...args: unknown[]
  ): net.Socket {
    const target = targetOf(args);
    if (target === null) return Reflect.apply(connect, this, args);
    attempts.push(target);
    process.nextTick(() => this.destroy(new NetworkAttemptError(target)));
    return this;
  };
}

/** Fails with the first address a test was refused, and forgets them: one test's attempt is not the next one's. */
export function assertNoNetworkAttempts(): void {
  const [first] = attempts.splice(0);
  if (first !== undefined) throw new NetworkAttemptError(first);
}

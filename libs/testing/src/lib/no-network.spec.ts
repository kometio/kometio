import net from 'node:net';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  NetworkAttemptError,
  assertNoNetworkAttempts,
  blockNetwork,
} from './no-network.test-fixture';
import { portOf } from './http-server.test-fixture';

/** An address from the documentation range (RFC 5737): it never answers, and nothing here is allowed to ask it. */
const ELSEWHERE = '203.0.113.7';

describe('blockNetwork', () => {
  beforeAll(blockNetwork);
  afterEach(() => {
    // A test that is expected to have been refused has already taken its
    // attempts; one that was not must have none.
    assertNoNetworkAttempts();
  });

  it('refuses a connection to another machine, and names it', async () => {
    const socket = net.connect({ host: ELSEWHERE, port: 443 });
    const error = await new Promise<Error>((resolve) =>
      socket.once('error', resolve),
    );

    expect(error).toBeInstanceOf(NetworkAttemptError);
    expect(error.message).toContain(`${ELSEWHERE}:443`);
    expect(() => assertNoNetworkAttempts()).toThrow(`${ELSEWHERE}:443`);
  });

  it('refuses what `fetch` asks of another machine, which the code under test may swallow', async () => {
    await expect(fetch(`http://${ELSEWHERE}/anything`)).rejects.toThrow();

    expect(() => assertNoNetworkAttempts()).toThrow(`${ELSEWHERE}:80`);
  });

  it('refuses a name as well as an address', async () => {
    await expect(fetch('http://example.com/')).rejects.toThrow();

    expect(() => assertNoNetworkAttempts()).toThrow('example.com:80');
  });

  it('forgets an attempt once it has been reported: the next test starts clean', async () => {
    await expect(fetch(`http://${ELSEWHERE}/`)).rejects.toThrow();
    expect(() => assertNoNetworkAttempts()).toThrow();

    expect(() => assertNoNetworkAttempts()).not.toThrow();
  });

  it.each([
    ['an address on this machine', '127.0.0.1'],
    ['its name', 'localhost'],
  ])('lets a test talk to its own server by %s', async (_, host) => {
    const server = net.createServer((socket) => socket.end('hello'));
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    try {
      const received = await new Promise<string>((resolve, reject) => {
        const socket = net.connect(portOf(server), host);
        socket.setEncoding('utf8');
        socket.once('data', resolve);
        socket.once('error', reject);
      });

      expect(received).toBe('hello');
    } finally {
      server.close();
    }
  });

  it('lets a test use a Unix socket', async () => {
    const server = net.createServer((socket) => socket.end('hello'));
    const path = `/tmp/kometio-no-network-${process.pid}.sock`;
    await new Promise<void>((resolve) => server.listen(path, resolve));
    try {
      const received = await new Promise<string>((resolve, reject) => {
        const socket = net.connect(path);
        socket.setEncoding('utf8');
        socket.once('data', resolve);
        socket.once('error', reject);
      });

      expect(received).toBe('hello');
    } finally {
      server.close();
    }
  });
});

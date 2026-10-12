import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import {
  createServer,
  request,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createImageCache } from '../../image-cache.mjs';

/*
 * The cache is in front of Astro's handler, as server.mjs puts it. The
 * handler here is a stand-in that counts how often it is asked and answers
 * what the endpoint answers: an image with its headers, after a moment (the
 * time a resize takes, which is what makes several requests at once overlap).
 */

interface Harness {
  base: string;
  directory: string;
  calls: () => number;
  close: () => Promise<void>;
}

const servers: Harness[] = [];

type Answer = (req: IncomingMessage, res: ServerResponse) => void;

const image =
  (bytes: number): Answer =>
  (_req, res) => {
    setTimeout(() => {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      res.setHeader('ETag', '"abc"');
      res.setHeader(
        'Content-Security-Policy',
        `script-src 'nonce-${Math.random()}'`,
      );
      res.end(Buffer.alloc(bytes, 7));
    }, 20);
  };

async function start(
  options: { maxBytes?: number; maxEntryBytes?: number } = {},
  answer?: Answer,
): Promise<Harness> {
  const directory = mkdtempSync(join(tmpdir(), 'kometio-image-cache-'));
  const calls = { n: 0 };
  const handler = answer ?? image(1000);
  const cache = createImageCache({ directory, ...options });
  const server: Server = createServer((req, res) => {
    void cache.handle(req, res, () => {
      calls.n += 1;
      handler(req, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const harness: Harness = {
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    directory,
    calls: () => calls.n,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      rmSync(directory, { recursive: true, force: true });
    },
  };
  servers.push(harness);
  return harness;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

const IMAGE = '/_image?href=%2Fa.png&w=800&f=webp';

describe('createImageCache', () => {
  it('makes an image once and gives it back with the headers the endpoint sent', async () => {
    const { base, calls } = await start();

    const first = await fetch(`${base}${IMAGE}`);
    const body = Buffer.from(await first.arrayBuffer());
    const second = await fetch(`${base}${IMAGE}`);

    expect(first.headers.get('x-kometio-image-cache')).toBe('miss');
    expect(second.headers.get('x-kometio-image-cache')).toBe('hit');
    expect(calls()).toBe(1);
    expect(Buffer.from(await second.arrayBuffer()).equals(body)).toBe(true);
    expect(second.headers.get('content-type')).toBe('image/webp');
    expect(second.headers.get('cache-control')).toBe(
      'public, max-age=31536000',
    );
    expect(second.headers.get('etag')).toBe('"abc"');
  });

  it('does not keep the CSP of the request that made it, whose nonce is that request’s own', async () => {
    const { base } = await start();

    await fetch(`${base}${IMAGE}`);
    const second = await fetch(`${base}${IMAGE}`);

    expect(second.headers.get('content-security-policy')).toBeNull();
  });

  it('answers 304 to a request that already has it', async () => {
    const { base } = await start();
    await fetch(`${base}${IMAGE}`);

    const response = await fetch(`${base}${IMAGE}`, {
      headers: { 'If-None-Match': '"abc"' },
    });

    expect(response.status).toBe(304);
  });

  it('makes it once for any number asking at the same moment', async () => {
    const { base, calls } = await start();

    const responses = await Promise.all(
      Array.from({ length: 12 }, () => fetch(`${base}${IMAGE}`)),
    );
    const bodies = await Promise.all(responses.map((r) => r.arrayBuffer()));

    expect(calls()).toBe(1);
    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(bodies.every((b) => b.byteLength === 1000)).toBe(true);
  });

  it('tells two sizes of one picture apart', async () => {
    const { base, calls } = await start();

    await fetch(`${base}/_image?href=%2Fa.png&w=400&f=webp`);
    await fetch(`${base}/_image?href=%2Fa.png&w=800&f=webp`);

    expect(calls()).toBe(2);
  });

  it('keeps an image per site address', async () => {
    const { base, calls } = await start();
    // `fetch` does not let a script choose its Host header; `http` does.
    const get = (host: string) =>
      new Promise<void>((resolve, reject) => {
        const url = new URL(`${base}${IMAGE}`);
        request(
          {
            host: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            headers: { Host: host },
          },
          (response) => {
            response.resume();
            response.on('end', resolve);
          },
        )
          .on('error', reject)
          .end();
      });

    await get('one.test');
    await get('two.test');
    await get('one.test');

    expect(calls()).toBe(2);
  });

  it('keeps nothing that is not an image with status 200', async () => {
    const { base, calls, directory } = await start({}, (_req, res) => {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'image/webp');
      res.end('not found');
    });

    await fetch(`${base}${IMAGE}`);
    await fetch(`${base}${IMAGE}`);

    expect(calls()).toBe(2);
    expect(readdirSync(directory)).toEqual([]);
  });

  it('asks the endpoint again for what failed, and does not keep the failure', async () => {
    const { base, calls, directory } = await start({}, (_req, res) => {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'text/plain');
      res.end('upstream');
    });

    await fetch(`${base}${IMAGE}`);
    await fetch(`${base}${IMAGE}`);

    expect(calls()).toBe(2);
    expect(readdirSync(directory)).toEqual([]);
  });

  it('does not keep an entry larger than it allows', async () => {
    const { base, calls, directory } = await start(
      { maxEntryBytes: 500 },
      image(1000),
    );

    await fetch(`${base}${IMAGE}`);
    await fetch(`${base}${IMAGE}`);

    expect(calls()).toBe(2);
    expect(readdirSync(directory)).toEqual([]);
  });

  it('lets go of the oldest entries when the directory is over its limit', async () => {
    const { base, calls } = await start({ maxBytes: 2500 });

    await fetch(`${base}/_image?href=%2F1.png&w=1`);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await fetch(`${base}/_image?href=%2F2.png&w=1`);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await fetch(`${base}/_image?href=%2F3.png&w=1`); // 3000 bytes: over 2500
    expect(calls()).toBe(3);

    const last = await fetch(`${base}/_image?href=%2F3.png&w=1`);
    const first = await fetch(`${base}/_image?href=%2F1.png&w=1`);

    expect(last.headers.get('x-kometio-image-cache')).toBe('hit');
    expect(first.headers.get('x-kometio-image-cache')).toBe('miss');
  });

  it('leaves everything that is not a resize to the handler', async () => {
    const { base, calls } = await start({}, (_req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end('<p>page</p>');
    });

    await fetch(`${base}/en/rich`);
    await fetch(`${base}/en/rich`);
    await fetch(`${base}/_image`); // no query: nothing to resize
    const post = await fetch(`${base}${IMAGE}`, { method: 'POST' });

    expect(calls()).toBe(4);
    expect(post.headers.get('x-kometio-image-cache')).toBeNull();
  });

  it('serves on, uncached, when its directory cannot be used', async () => {
    const calls = { n: 0 };
    const cache = createImageCache({ directory: '/dev/null/not-a-directory' });
    const server = createServer((req, res) => {
      void cache.handle(req, res, () => {
        calls.n += 1;
        image(1000)(req, res);
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const first = await fetch(`${base}${IMAGE}`);
    const second = await fetch(`${base}${IMAGE}`);
    await new Promise((resolve) => server.close(resolve));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(calls.n).toBe(2);
  });
});

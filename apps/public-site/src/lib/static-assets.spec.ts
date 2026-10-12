import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { staticAssets } from '../../static-assets.mjs';

let directory: string;
let server: Server;
let base: string;

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'kometio-static-'));
  mkdirSync(join(directory, '_astro'));
  writeFileSync(join(directory, '_astro', 'page.abc123.css'), 'a{}');
  writeFileSync(join(directory, 'favicon.ico'), 'icon');
  const assets = staticAssets(directory);
  server = createServer((req, res) => {
    // What server.mjs does: the files first, then Astro's handler for the rest.
    assets(req, res, () => {
      res.statusCode = 404;
      res.end('rendered by astro');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(directory, { recursive: true, force: true });
});

describe('staticAssets', () => {
  it('keeps a hashed bundle for good', async () => {
    const response = await fetch(`${base}/_astro/page.abc123.css`);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=31536000, immutable',
    );
  });

  it('says nothing of a file that is not hashed', async () => {
    const response = await fetch(`${base}/favicon.ico`);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBeNull();
  });

  it('does not let a 404 under /_astro/ be kept for a year: the name may be the next build’s', async () => {
    const response = await fetch(`${base}/_astro/not-built-yet.def456.js`);

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('rendered by astro');
    expect(response.headers.get('cache-control')).toBeNull();
  });

  it('leaves a page of the site to Astro, with nothing said about its cache', async () => {
    const response = await fetch(`${base}/en/about`);

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBeNull();
  });
});

// The images the site has already made, kept on disk.
//
// `/_image` is Astro's endpoint: it fetches the original, resizes and
// re-encodes it with sharp, and answers. It sends a year-long
// `Cache-Control`, so a browser or a CDN that was put in front keeps what it
// got — but the server itself keeps nothing, and every visitor whose
// browser has never seen the picture makes it again. Measured on the image
// limited to two CPUs, a page of 23 blocks answers some 300 requests a
// second and this endpoint some 6 to 9: one gallery of twenty pictures, seen
// cold by a hundred people at once, is two thousand resizes and a site that
// does not answer for minutes.
//
// This keeps the first answer of each request and gives it back, and makes
// each one once however many ask for it at the same time. It is the origin's
// part of that problem: a CDN in front still helps, and is not needed for the
// site to stand.
//
// What is kept is bounded (the whole directory, and each entry), is only an
// answer the endpoint gave with status 200 and a raster type (never an SVG, a
// document), and goes when the server restarts with its directory: it is made
// again, never migrated. What a hit says about itself is fixed here — it is a
// picture, `nosniff`, with a CSP that allows nothing — and not what the answer
// that made it carried.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const IMAGE_ENDPOINT = '/_image';

const DEFAULT_MAX_BYTES = 256 * 1024 * 1024;
/** A photograph at a sensible width is a few hundred kilobytes; this is what is not worth a place. */
const DEFAULT_MAX_ENTRY_BYTES = 8 * 1024 * 1024;
/**
 * Only what a browser cannot be made to run: an SVG is a document, and one
 * with a script in it, opened by its address, would run in the site's origin
 * — which the CSP of the page's own answer was what prevented, and a cached
 * copy does not carry. Rasters only.
 */
const CACHEABLE_TYPE = /^image\/(webp|avif|jpeg|png|gif)$/;
/**
 * What a request says that can change where the endpoint fetches a path
 * from: Astro makes the origin of a relative `href` from these. Two requests
 * that differ in them are two requests.
 */
const ORIGIN_HEADERS = [
  'host',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-forwarded-port',
  'forwarded',
];
/** More than this being made at once are made but not kept: each is held in memory until it is done. */
const MAX_IN_FLIGHT = 16;
/** What a hit says about itself: it is a picture and nothing else, whatever the file it was made from. */
const HIT_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; sandbox",
};
/** Evicting down to this, not to the limit, so that it is not done on every store. */
const EVICT_TO = 0.8;
/**
 * What of the endpoint's answer is given back. The rest belongs to a
 * request: the CSP the middleware adds has a nonce of that request's own, and
 * the date and the length are the response's.
 */
const KEPT_HEADERS = [
  'content-type',
  'cache-control',
  'etag',
  'referrer-policy',
];

/**
 * @param {object} options
 * @param {string} options.directory where the entries are written; made if missing
 * @param {number} [options.maxBytes] the most the directory may hold
 * @param {number} [options.maxEntryBytes] the most one entry may be
 */
export function createImageCache({
  directory: wanted,
  maxBytes = DEFAULT_MAX_BYTES,
  maxEntryBytes = DEFAULT_MAX_ENTRY_BYTES,
}) {
  let directory = wanted;
  /** key -> { bytes, usedAt, headers } */
  const entries = new Map();
  /** key -> Promise, resolved once the request that is making it has finished */
  const making = new Map();
  let total = 0;
  const ready = prepare();
  let warned = false;

  /**
   * The directory is this process's own: made with 0700, and if it was
   * there already it must be a real directory of this user and nobody
   * else's. A path in a shared temporary directory is predictable, and
   * another user of the machine (the API, a theme's code) could have put a
   * link or a file of its own there.
   */
  async function trusted() {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const found = await lstat(directory);
    const owner =
      typeof process.getuid === 'function' ? process.getuid() : found.uid;
    if (
      found.isDirectory() &&
      found.uid === owner &&
      (found.mode & 0o077) === 0
    ) {
      return directory;
    }
    return mkdtemp(join(dirname(directory), 'kometio-image-cache-'));
  }

  /** A header value with one of these cannot be given back: it would end the header, or the response. */
  function hasControlCharacter(text) {
    return [...text].some((character) => {
      const code = character.charCodeAt(0);
      return code < 0x20 || code === 0x7f;
    });
  }

  /** What an entry's saved headers may be: the ones this module keeps, as plain text and a type it serves. */
  function validHeaders(value) {
    if (typeof value !== 'object' || value === null) return null;
    const headers = {};
    for (const name of KEPT_HEADERS) {
      const header = value[name];
      if (header === undefined) continue;
      if (typeof header !== 'string' || hasControlCharacter(header))
        return null;
      headers[name] = header;
    }
    return CACHEABLE_TYPE.test(headers['content-type'] ?? '') ? headers : null;
  }

  async function prepare() {
    try {
      directory = await trusted();
      for (const name of await readdir(directory)) {
        if (!/^[0-9a-f]{64}\.json$/.test(name)) continue;
        const key = name.slice(0, -'.json'.length);
        try {
          const headers = validHeaders(
            JSON.parse(await readFile(join(directory, name), 'utf8')),
          );
          const body = await lstat(join(directory, `${key}.body`));
          if (!headers || !body.isFile() || body.size > maxEntryBytes) continue;
          entries.set(key, { bytes: body.size, usedAt: body.mtimeMs, headers });
          total += body.size;
        } catch {
          // A half-written pair: not an entry.
        }
      }
    } catch (error) {
      warn(error);
      directory = null;
    }
  }

  function warn(error) {
    if (warned) return;
    warned = true;
    console.warn(
      `The image cache cannot use ${directory} (${error.code ?? error.message}); images are made on every request.`,
    );
  }

  function keyOf(req) {
    return createHash('sha256')
      .update(
        [
          ...ORIGIN_HEADERS.map((name) => String(req.headers[name] ?? '')),
          req.url,
        ].join('\n'),
      )
      .digest('hex');
  }

  function isCacheable(req) {
    if (req.method !== 'GET' || typeof req.url !== 'string') return false;
    const queryAt = req.url.indexOf('?');
    return queryAt !== -1 && req.url.slice(0, queryAt) === IMAGE_ENDPOINT;
  }

  function give(req, res, key) {
    const entry = entries.get(key);
    entry.usedAt = Date.now();
    for (const [name, value] of Object.entries(entry.headers)) {
      res.setHeader(name, value);
    }
    for (const [name, value] of Object.entries(HIT_HEADERS)) {
      res.setHeader(name, value);
    }
    res.setHeader('X-Kometio-Image-Cache', 'hit');
    if (
      entry.headers.etag &&
      req.headers['if-none-match'] === entry.headers.etag
    ) {
      res.statusCode = 304;
      res.end();
      return;
    }
    res.statusCode = 200;
    res.setHeader('Content-Length', entry.bytes);
    const stream = createReadStream(join(directory, `${key}.body`));
    stream.on('error', () => {
      // The file went (evicted a moment ago): nothing more can be said to
      // a response that has begun.
      entries.delete(key);
      res.destroy();
    });
    stream.pipe(res);
  }

  async function store(key, headers, body) {
    const bodyPath = join(directory, `${key}.body`);
    const temporary = `${bodyPath}.${process.pid}.tmp`;
    await writeFile(temporary, body, { mode: 0o600 });
    await rename(temporary, bodyPath);
    await writeFile(join(directory, `${key}.json`), JSON.stringify(headers), {
      mode: 0o600,
    });
    const before = entries.get(key)?.bytes ?? 0;
    entries.set(key, { bytes: body.length, usedAt: Date.now(), headers });
    total += body.length - before;
    if (total > maxBytes) await evict();
  }

  async function evict() {
    const oldestFirst = [...entries.entries()].sort(
      (a, b) => a[1].usedAt - b[1].usedAt,
    );
    for (const [key, entry] of oldestFirst) {
      if (total <= maxBytes * EVICT_TO) break;
      entries.delete(key);
      total -= entry.bytes;
      await Promise.all([
        rm(join(directory, `${key}.json`), { force: true }),
        rm(join(directory, `${key}.body`), { force: true }),
      ]);
    }
  }

  /** Lets `next` answer, and keeps a copy of the answer if it is one worth keeping. */
  function makeAndKeep(res, key, next) {
    return new Promise((resolve) => {
      const chunks = [];
      let size = 0;
      let tooBig = false;
      const record = (chunk, encoding) => {
        if (
          chunk === undefined ||
          chunk === null ||
          typeof chunk === 'function'
        )
          return;
        const buffer = Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(
              chunk,
              typeof encoding === 'string' ? encoding : 'utf8',
            );
        size += buffer.length;
        if (size > maxEntryBytes) {
          tooBig = true;
          chunks.length = 0;
          return;
        }
        if (!tooBig) chunks.push(buffer);
      };
      const write = res.write.bind(res);
      const end = res.end.bind(res);
      res.write = (chunk, encoding, callback) => {
        record(chunk, encoding);
        return write(chunk, encoding, callback);
      };
      res.end = (chunk, encoding, callback) => {
        record(chunk, encoding);
        return end(chunk, encoding, callback);
      };
      res.once('close', async () => {
        try {
          const contentType = String(res.getHeader('content-type') ?? '');
          const complete = res.writableFinished && !tooBig;
          if (
            complete &&
            res.statusCode === 200 &&
            CACHEABLE_TYPE.test(contentType) &&
            chunks.length > 0
          ) {
            const headers = {};
            for (const name of KEPT_HEADERS) {
              const value = res.getHeader(name);
              if (value !== undefined) headers[name] = String(value);
            }
            await store(key, headers, Buffer.concat(chunks));
          }
        } catch (error) {
          warn(error);
        } finally {
          resolve();
        }
      });
      try {
        next();
      } catch (error) {
        warn(error);
        if (!res.headersSent) res.statusCode = 500;
        res.end();
      }
    });
  }

  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {() => void} next answers the request when the cache cannot
   */
  async function handle(req, res, next) {
    if (!isCacheable(req)) return next();
    await ready;
    const key = keyOf(req);
    if (entries.has(key)) return give(req, res, key);

    const inFlight = making.get(key);
    if (inFlight) {
      await inFlight;
      if (entries.has(key)) return give(req, res, key);
      res.setHeader('X-Kometio-Image-Cache', 'miss');
      return next();
    }

    res.setHeader('X-Kometio-Image-Cache', 'miss');
    if (!directory || making.size >= MAX_IN_FLIGHT) return next();
    const made = makeAndKeep(res, key, next).finally(() => making.delete(key));
    making.set(key, made);
    return made;
  }

  return {
    handle,
    size: () => total,
    count: () => entries.size,
    /** Resolves once every entry being made has been written (or has given up): what a caller that is about to remove the directory waits for. */
    settled: () => Promise.allSettled([...making.values()]),
  };
}

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
// answer the endpoint gave with status 200 and an image type, and goes when
// the server restarts with its directory: it is made again, never migrated.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';

export const IMAGE_ENDPOINT = '/_image';

const DEFAULT_MAX_BYTES = 256 * 1024 * 1024;
/** A photograph at a sensible width is a few hundred kilobytes; this is what is not worth a place. */
const DEFAULT_MAX_ENTRY_BYTES = 8 * 1024 * 1024;
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
  directory,
  maxBytes = DEFAULT_MAX_BYTES,
  maxEntryBytes = DEFAULT_MAX_ENTRY_BYTES,
}) {
  /** key -> { bytes, usedAt, headers } */
  const entries = new Map();
  /** key -> Promise, resolved once the request that is making it has finished */
  const making = new Map();
  let total = 0;
  const ready = prepare();
  let warned = false;

  async function prepare() {
    try {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      for (const name of await readdir(directory)) {
        if (!name.endsWith('.json')) continue;
        const key = name.slice(0, -'.json'.length);
        try {
          const headers = JSON.parse(
            await readFile(join(directory, name), 'utf8'),
          );
          const { size, mtimeMs } = await stat(join(directory, `${key}.body`));
          entries.set(key, { bytes: size, usedAt: mtimeMs, headers });
          total += size;
        } catch {
          // A half-written pair: not an entry.
        }
      }
    } catch (error) {
      warn(error);
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
      .update(`${req.headers.host ?? ''}\n${req.url}`)
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
            contentType.startsWith('image/') &&
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
    const made = makeAndKeep(res, key, next).finally(() => making.delete(key));
    making.set(key, made);
    return made;
  }

  return { handle, size: () => total, count: () => entries.size };
}

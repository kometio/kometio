import { readFile } from 'node:fs/promises';
import { request, type IncomingMessage } from 'node:http';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import {
  InvalidSiteArchiveError,
  SiteArchiveRefusedError,
} from '@kometio/domain-core';
import type {
  SiteArchive,
  SiteArchivePort,
  SiteImportPort,
} from '@kometio/ports';

export interface LauncherSiteArchiveConfig {
  /** The Unix socket the launcher of the single image answers on (docs/adr/0105). */
  socketPath: string;
}

/**
 * Where the launcher writes how the last import went, beside its socket
 * (`IMPORT_RESULT_FILE` in docker/kometio/site-import.mjs, which is not
 * TypeScript and cannot be imported from here: the name is the contract).
 */
const IMPORT_RESULT_FILE = 'import-result.json';

/** What the launcher names its file: a name that is safe to put in a header as it is. */
const ATTACHMENT = /^attachment; filename="([A-Za-z0-9._-]{1,100})"$/;

/** What a refusal can say, at most: a message is a sentence, and what is read of one is bounded. */
const MAX_MESSAGE_BYTES = 4096;

function hasMessage(value: unknown): value is { message: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof value.message === 'string'
  );
}

/** The launcher answers with `{ "message": … }`; anything else is shown as it came. */
async function messageOf(response: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of response) {
    const piece = Buffer.from(chunk);
    chunks.push(piece);
    size += piece.length;
    if (size > MAX_MESSAGE_BYTES) {
      response.destroy();
      break;
    }
  }
  const text = Buffer.concat(chunks)
    .toString('utf8')
    .slice(0, MAX_MESSAGE_BYTES);
  try {
    const parsed: unknown = JSON.parse(text);
    if (hasMessage(parsed)) return parsed.message;
  } catch {
    // Not JSON: the text is what there is.
  }
  return text.trim() || 'no reason given';
}

function hasFailure(value: unknown): value is { ok: false; message: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'ok' in value &&
    value.ok === false &&
    'message' in value &&
    typeof value.message === 'string'
  );
}

function get(socketPath: string, path: string): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const outgoing = request({ socketPath, path, method: 'GET' }, resolve);
    outgoing.once('error', reject);
    outgoing.end();
  });
}

/**
 * The archive of the site, asked of the launcher that runs this deployment's own
 * database and holds the means to dump it (docs/adr/0105). The API is never
 * given those: it asks, over a socket only its user can open, and streams what
 * comes back to the person who asked.
 */
export class LauncherSiteArchiveAdapter
  implements SiteArchivePort, SiteImportPort
{
  constructor(private readonly config: LauncherSiteArchiveConfig) {}

  async export(): Promise<SiteArchive> {
    const response = await get(this.config.socketPath, '/export');
    if (response.statusCode !== 200) {
      const reason = await messageOf(response);
      if (response.statusCode === 409)
        throw new SiteArchiveRefusedError(reason);
      throw new Error(
        `The launcher could not make the archive (${response.statusCode}): ${reason}`,
      );
    }
    const fileName = ATTACHMENT.exec(
      response.headers['content-disposition'] ?? '',
    )?.[1];
    if (fileName === undefined) {
      response.destroy();
      throw new Error('The launcher did not say what the archive is called.');
    }
    return { fileName, content: response };
  }

  async import(content: AsyncIterable<Uint8Array>): Promise<void> {
    const response = await new Promise<IncomingMessage>((resolve, reject) => {
      const outgoing = request(
        {
          socketPath: this.config.socketPath,
          path: '/import',
          method: 'POST',
          headers: { 'content-type': 'application/gzip' },
        },
        resolve,
      );
      outgoing.once('error', reject);
      // The launcher may answer before the end of the body (and then close the
      // connection), which is the answer to read, not the broken pipe after it:
      // whichever settles the promise first wins, and the other is ignored.
      pipeline(content, outgoing).catch(reject);
    });
    if (response.statusCode === 202) {
      response.resume();
      return;
    }
    const reason = await messageOf(response);
    if (response.statusCode === 400) throw new InvalidSiteArchiveError(reason);
    if (response.statusCode === 409) throw new SiteArchiveRefusedError(reason);
    throw new Error(
      `The launcher could not open the archive (${response.statusCode}): ${reason}`,
    );
  }

  async lastImportFailure(): Promise<string | null> {
    let written: string;
    try {
      written = await readFile(
        join(dirname(this.config.socketPath), IMPORT_RESULT_FILE),
        'utf8',
      );
    } catch {
      // No import has been made here, or the launcher has not written one yet.
      return null;
    }
    try {
      const result: unknown = JSON.parse(written);
      return hasFailure(result) ? result.message : null;
    } catch {
      return null;
    }
  }
}

import { mkdtempSync, rmSync } from 'node:fs';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SiteArchiveRefusedError } from '@kometio/domain-core';
import { LauncherSiteArchiveAdapter } from './launcher-site-archive.adapter';

type Handler = (request: IncomingMessage, response: ServerResponse) => void;

/** Unix socket paths are short (104 bytes on a Mac): a folder in the system's temp. */
const directory = mkdtempSync(join(tmpdir(), 'lsa-'));
const socketPath = join(directory, 'control.sock');

async function read(content: AsyncIterable<Uint8Array>): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of content) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString();
}

describe('LauncherSiteArchiveAdapter', () => {
  let server: Server;
  let handler: Handler;
  const adapter = new LauncherSiteArchiveAdapter({ socketPath });

  beforeAll(async () => {
    server = createServer((request, response) => handler(request, response));
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  });

  it('asks for the export, and hands over the archive with the name the launcher gave it', async () => {
    let asked = '';
    handler = (request, response) => {
      asked = `${request.method} ${request.url}`;
      response.writeHead(200, {
        'content-type': 'application/gzip',
        'content-disposition':
          'attachment; filename="kometio-site-20261005-1200.tar.gz"',
      });
      response.end('the archive');
    };

    const archive = await adapter.export();

    expect(asked).toBe('GET /export');
    expect(archive.fileName).toBe('kometio-site-20261005-1200.tar.gz');
    expect(await read(archive.content)).toBe('the archive');
  });

  it('resolves once the archive has begun, not once it is whole', async () => {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => (finish = resolve));
    handler = (_request, response) => {
      response.writeHead(200, {
        'content-disposition': 'attachment; filename="a.tar.gz"',
      });
      response.flushHeaders();
      void gate.then(() => response.end('late'));
    };

    const archive = await adapter.export();
    finish();

    expect(await read(archive.content)).toBe('late');
  });

  it('turns a refusal into one, with the launcher’s words', async () => {
    handler = (_request, response) => {
      response.writeHead(409, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({ message: 'an export is already being made' }),
      );
    };

    const failure = adapter.export();

    await expect(failure).rejects.toBeInstanceOf(SiteArchiveRefusedError);
    await expect(failure).rejects.toThrow('an export is already being made');
  });

  it('treats any other answer as the launcher failing, and says what it said', async () => {
    handler = (_request, response) => {
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({ message: 'pg_dump failed: no space left' }),
      );
    };

    await expect(adapter.export()).rejects.toThrow(
      'The launcher could not make the archive (500): pg_dump failed: no space left',
    );
  });

  it('reads a plain-text failure as it is, and no more than a sentence of it', async () => {
    handler = (_request, response) => {
      response.writeHead(502);
      response.end('x'.repeat(100_000));
    };

    await expect(adapter.export()).rejects.toThrow(
      /^The launcher could not make the archive \(502\): x{4096}$/,
    );
  });

  it('refuses a file name that is not safe to put in a header', async () => {
    handler = (_request, response) => {
      response.writeHead(200, {
        'content-disposition': 'attachment; filename="a\\".tar.gz"',
      });
      response.end('x');
    };

    await expect(adapter.export()).rejects.toThrow(
      'did not say what the archive is called',
    );
  });

  it('fails when nobody is listening', async () => {
    const absent = new LauncherSiteArchiveAdapter({
      socketPath: join(directory, 'nobody.sock'),
    });

    await expect(absent.export()).rejects.toThrow(/ENOENT|ECONNREFUSED/);
  });

  it('ends the archive with an error, not quietly, when the launcher cuts it short', async () => {
    handler = (_request, response) => {
      response.writeHead(200, {
        'content-disposition': 'attachment; filename="a.tar.gz"',
      });
      response.write('half');
      setTimeout(() => response.destroy(), 20);
    };

    const archive = await adapter.export();

    await expect(read(archive.content)).rejects.toThrow();
  });
});

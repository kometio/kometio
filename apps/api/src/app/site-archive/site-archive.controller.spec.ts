import { PassThrough, Readable } from 'node:stream';
import { ForbiddenException } from '@nestjs/common';
import { SiteArchiveUnavailableError } from '@kometio/domain-core';
import type { SiteArchive, SiteArchivePort } from '@kometio/ports';
import { SiteArchiveController } from './site-archive.controller';

/** What the controller writes through, which is a writable stream with headers. */
class FakeResponse extends PassThrough {
  statusCode = 0;
  readonly headers = new Map<string, string>();
  flushed = false;
  status(code: number) {
    this.statusCode = code;
    return this;
  }
  setHeader(name: string, value: string) {
    this.headers.set(name, value);
    return this;
  }
  flushHeaders() {
    this.flushed = true;
  }
}

async function collect(stream: PassThrough): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString();
}

function archiving(archive: SiteArchive | Error): SiteArchivePort {
  return {
    export: () =>
      archive instanceof Error
        ? Promise.reject(archive)
        : Promise.resolve(archive),
  };
}

describe('SiteArchiveController (unit)', () => {
  it('sends the archive as a download that is never kept, with the headers out before the first byte', async () => {
    const controller = new SiteArchiveController(
      archiving({
        fileName: 'kometio-site-20261005-1200.tar.gz',
        content: Readable.from([Buffer.from('some '), Buffer.from('bytes')]),
      }),
    );
    const response = new FakeResponse();

    const done = controller.download('user-1', undefined, response);
    const body = collect(response);
    await done;

    expect(response.statusCode).toBe(200);
    expect(response.flushed).toBe(true);
    expect(response.headers.get('Content-Type')).toBe('application/gzip');
    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="kometio-site-20261005-1200.tar.gz"',
    );
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await body).toBe('some bytes');
  });

  it('says there is none on a deployment that cannot make one', async () => {
    const controller = new SiteArchiveController(null);

    await expect(
      controller.download('user-1', undefined, new FakeResponse()),
    ).rejects.toBeInstanceOf(SiteArchiveUnavailableError);
  });

  it('refuses a link followed from another site, before anything is made', async () => {
    const exported = jest.fn();
    const controller = new SiteArchiveController({ export: exported });

    await expect(
      controller.download('user-1', 'cross-site', new FakeResponse()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(exported).not.toHaveBeenCalled();
  });

  it.each(['same-origin', 'same-site', 'none'])(
    'follows a link that comes from %s',
    async (fetchSite) => {
      const controller = new SiteArchiveController(
        archiving({
          fileName: 'a.tar.gz',
          content: Readable.from([Buffer.from('x')]),
        }),
      );
      const response = new FakeResponse();
      const body = collect(response);

      await controller.download('user-1', fetchSite, response);

      expect(await body).toBe('x');
    },
  );

  it('answers nothing of its own when the archive is refused: the error is the answer', async () => {
    const refusal = new Error('refused');
    const controller = new SiteArchiveController(archiving(refusal));
    const response = new FakeResponse();

    await expect(
      controller.download('user-1', undefined, response),
    ).rejects.toBe(refusal);
    expect(response.flushed).toBe(false);
  });

  it('cuts the connection when the archive fails on its way, and does not throw into a response already sent', async () => {
    async function* failing(): AsyncGenerator<Uint8Array> {
      yield Buffer.from('half');
      throw new Error('tar failed');
    }
    const controller = new SiteArchiveController(
      archiving({ fileName: 'a.tar.gz', content: failing() }),
    );
    const response = new FakeResponse();
    response.on('error', () => undefined);

    await controller.download('user-1', undefined, response);

    expect(response.destroyed).toBe(true);
  });
});

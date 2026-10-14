import { PassThrough, Readable } from 'node:stream';
import { ForbiddenException } from '@nestjs/common';
import { SiteArchiveUnavailableError } from '@kometio/domain-core';
import type { SiteArchive, SiteArchivePort } from '@kometio/ports';
import { InMemoryAuditLog } from '@kometio/testing';
import { AuditRecorder } from '../audit/audit-recorder';
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

const auditLog = new InMemoryAuditLog();
const recorder = () => new AuditRecorder(auditLog);

describe('SiteArchiveController (unit)', () => {
  beforeEach(() => {
    auditLog.events.length = 0;
  });

  it('sends the archive as a download that is never kept, with the headers out before the first byte', async () => {
    const controller = new SiteArchiveController(
      archiving({
        fileName: 'kometio-site-20261005-1200.tar.gz',
        content: Readable.from([Buffer.from('some '), Buffer.from('bytes')]),
      }),
      recorder(),
    );
    const response = new FakeResponse();

    const done = controller.download('tenant-1', 'user-1', undefined, response);
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
    const controller = new SiteArchiveController(null, recorder());

    await expect(
      controller.download('tenant-1', 'user-1', undefined, new FakeResponse()),
    ).rejects.toBeInstanceOf(SiteArchiveUnavailableError);
  });

  it('refuses a link followed from another site, before anything is made', async () => {
    const exported = jest.fn();
    const controller = new SiteArchiveController(
      { export: exported },
      recorder(),
    );

    await expect(
      controller.download(
        'tenant-1',
        'user-1',
        'cross-site',
        new FakeResponse(),
      ),
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
        recorder(),
      );
      const response = new FakeResponse();
      const body = collect(response);

      await controller.download('tenant-1', 'user-1', fetchSite, response);

      expect(await body).toBe('x');
    },
  );

  it('answers nothing of its own when the archive is refused: the error is the answer', async () => {
    const refusal = new Error('refused');
    const controller = new SiteArchiveController(
      archiving(refusal),
      recorder(),
    );
    const response = new FakeResponse();

    await expect(
      controller.download('tenant-1', 'user-1', undefined, response),
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
      recorder(),
    );
    const response = new FakeResponse();
    response.on('error', () => undefined);

    await controller.download('tenant-1', 'user-1', undefined, response);

    expect(response.destroyed).toBe(true);
  });

  it('says that the archive was taken, and by whom', async () => {
    const controller = new SiteArchiveController(
      archiving({ fileName: 'a.tar.gz', content: Readable.from(['x']) }),
      recorder(),
    );
    const response = new FakeResponse();
    const done = controller.download('tenant-1', 'user-1', undefined, response);
    const drained = collect(response);
    await done;
    await drained;

    expect(auditLog.events).toEqual([
      {
        tenantId: 'tenant-1',
        actorUserId: 'user-1',
        action: 'archive.exported',
      },
    ]);
  });

  it('says nothing for a download that was refused', async () => {
    const controller = new SiteArchiveController(
      archiving(new Error('no room')),
      recorder(),
    );

    await expect(
      controller.download('tenant-1', 'user-1', undefined, new FakeResponse()),
    ).rejects.toThrow('no room');

    expect(auditLog.events).toEqual([]);
  });
});

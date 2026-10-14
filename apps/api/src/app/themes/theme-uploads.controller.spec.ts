import { access, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { NotFoundException } from '@nestjs/common';
import { ThemeUploadRejectedError } from '@kometio/domain-core';
import type { ThemeCatalogPort, ThemeUploadPort } from '@kometio/ports';
import type { ThemeUploadStatus } from '@kometio/shared-types';
import { InMemoryAuditLog } from '@kometio/testing';
import { AuditRecorder } from '../audit/audit-recorder';
import { ThemeUploadsController } from './theme-uploads.controller';

/** What multer hands the controller, taken from its own signature. */
type UploadedFile = NonNullable<
  Parameters<ThemeUploadsController['upload']>[2]
>;

const auditLog = new InMemoryAuditLog();
const recorder = () => new AuditRecorder(auditLog);

const queued: ThemeUploadStatus = {
  id: '0b1c2d3e-4f50-4617-8899-aabbccddeeff',
  name: 'portfolio',
  state: 'queued',
  failure: null,
  log: null,
  createdAt: '2026-09-28T00:00:00.000Z',
  updatedAt: '2026-09-28T00:00:00.000Z',
};

/** A file where multer would have left one, with the name multer was told to give it. */
async function uploaded(): Promise<UploadedFile> {
  const filename = `kometio-theme-${Math.random().toString(16).slice(2)}.zip`;
  await writeFile(join(tmpdir(), filename), 'zip bytes');
  const path = join(tmpdir(), filename);
  return {
    fieldname: 'file',
    originalname: 'theme.zip',
    encoding: '7bit',
    mimetype: 'application/zip',
    size: 9,
    destination: tmpdir(),
    filename,
    path,
    buffer: Buffer.alloc(0),
    stream: Readable.from([]),
  };
}

const exists = (file: UploadedFile) =>
  access(join(tmpdir(), file.filename)).then(
    () => true,
    () => false,
  );

describe('ThemeUploadsController (unit)', () => {
  let themeUploads: jest.Mocked<ThemeUploadPort>;
  let themeCatalog: jest.Mocked<ThemeCatalogPort>;

  beforeEach(() => {
    themeUploads = {
      inspect: jest.fn().mockResolvedValue({ ok: true, name: 'portfolio' }),
      enqueue: jest.fn().mockResolvedValue(queued),
      status: jest.fn().mockResolvedValue(queued),
    };
    themeCatalog = {
      listAvailableThemes: jest
        .fn()
        .mockResolvedValue([{ name: 'classic', uploaded: false }]),
    };
  });

  it('says whether uploads are on', () => {
    expect(
      new ThemeUploadsController(
        { themeUploads, themeCatalog },
        recorder(),
      ).settings(),
    ).toEqual({ enabled: true });
    expect(
      new ThemeUploadsController(
        {
          themeUploads: null,
          themeCatalog,
        },
        recorder(),
      ).settings(),
    ).toEqual({
      enabled: false,
    });
  });

  it('queues an upload the site can take', async () => {
    const file = await uploaded();
    const controller = new ThemeUploadsController(
      {
        themeUploads,
        themeCatalog,
      },
      recorder(),
    );

    expect(await controller.upload('tenant-1', 'admin-1', file)).toBe(queued);
    expect(themeUploads.enqueue).toHaveBeenCalledWith(
      join(tmpdir(), file.filename),
      'portfolio',
    );
  });

  it('deletes a refused upload rather than leaving it in the temp directory', async () => {
    themeUploads.inspect.mockResolvedValue({ ok: false, failure: 'link' });
    const file = await uploaded();

    await expect(
      new ThemeUploadsController(
        { themeUploads, themeCatalog },
        recorder(),
      ).upload('tenant-1', 'admin-1', file),
    ).rejects.toBeInstanceOf(ThemeUploadRejectedError);
    expect(await exists(file)).toBe(false);
  });

  it('refuses, and deletes, an upload where uploads are off', async () => {
    const file = await uploaded();

    await expect(
      new ThemeUploadsController(
        { themeUploads: null, themeCatalog },
        recorder(),
      ).upload('tenant-1', 'admin-1', file),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(await exists(file)).toBe(false);
  });

  it("answers an upload's status", async () => {
    expect(
      await new ThemeUploadsController(
        { themeUploads, themeCatalog },
        recorder(),
      ).status(queued.id),
    ).toBe(queued);
  });

  it('says that code was uploaded and by whom, once it is queued', async () => {
    auditLog.events.length = 0;
    const file = await uploaded();

    await new ThemeUploadsController(
      { themeUploads, themeCatalog },
      recorder(),
    ).upload('tenant-1', 'admin-1', file);

    expect(auditLog.events).toEqual([
      {
        tenantId: 'tenant-1',
        actorUserId: 'admin-1',
        action: 'theme.uploaded',
        targetId: queued.id,
        targetLabel: 'portfolio',
      },
    ]);
  });
});

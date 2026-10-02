import { randomUUID } from 'node:crypto';
import { mkdir, rmdir, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import sharp from 'sharp';
import { MediaModule } from './media.module';
import { mountMediaStatic } from '../media-static';
import { IntegrationApp } from '../../test/integration-app.test-fixture';

/**
 * Runs against a real Postgres and writes real files under MEDIA_UPLOAD_DIR
 * — see docs/development.md. Same throwaway-site-under-DEFAULT_TENANT_ID
 * isolation as pages.controller.integration.spec.ts, and cleans up every
 * file it writes in afterAll (this suite's own responsibility, since
 * MEDIA_UPLOAD_DIR isn't test-scoped the way an in-memory fixture would be).
 */
describe('MediaController (integration)', () => {
  let integration: IntegrationApp;
  let app: INestApplication;
  let agent: ReturnType<typeof request.agent>;
  let siteId: string;
  const uploadedStorageKeys: string[] = [];

  beforeAll(async () => {
    integration = await IntegrationApp.start({
      imports: [MediaModule],
      // Mirrors main.ts's static-serving setup (minus the global prefix,
      // which this isolated test harness — like the sibling integration
      // specs — never sets either) so this suite exercises the real
      // upload-then-served-back path, not just the controller in isolation.
      // The real serving configuration, not a bare static mount: a test
      // that sets up its own headers is testing itself.
      beforeInit: (nestApp) =>
        mountMediaStatic(nestApp, process.env.MEDIA_UPLOAD_DIR as string),
    });
    app = integration.app;
    siteId = await integration.createSite();
    agent = await integration.login(await integration.createUser());
  });

  afterAll(async () => {
    const uploadDir = process.env.MEDIA_UPLOAD_DIR as string;
    for (const key of uploadedStorageKeys) {
      await unlink(`${uploadDir}/${key}`).catch(() => undefined);
      if (key.startsWith('files/')) {
        await rmdir(join(uploadDir, dirname(key))).catch(() => undefined);
      }
    }
    await integration.close();
  });

  function pngBuffer(width: number, height: number): Promise<Buffer> {
    return sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    })
      .png()
      .toBuffer();
  }

  it('uploads an image, converts it, and serves it back over HTTP', async () => {
    const data = await pngBuffer(400, 300);

    const uploadRes = await agent
      .post('/media')
      .field('siteId', siteId)
      .attach('file', data, 'foto.png')
      .expect(201);

    expect(uploadRes.body.storageKey).toMatch(/\.webp$/);
    expect(uploadRes.body.mimeType).toBe('image/webp');
    expect(uploadRes.body.width).toBe(400);
    expect(uploadRes.body.url).toContain('/uploads/');
    uploadedStorageKeys.push(uploadRes.body.storageKey);

    const servedRes = await request(app.getHttpServer())
      .get(`/uploads/${uploadRes.body.storageKey}`)
      .expect(200);
    expect(servedRes.headers['content-type']).toContain('image/webp');
  });

  /**
   * A minimal but structurally real MP4: an `ftyp` box declaring the
   * `isom` brand, then an `mdat`. Built here rather than committed as a
   * fixture because what is being tested is the signature check, and the
   * signature is these first bytes.
   */
  function mp4Buffer(): Buffer {
    const box = (type: string, payload: Buffer): Buffer => {
      const header = Buffer.alloc(8);
      header.writeUInt32BE(8 + payload.length, 0);
      header.write(type, 4, 'ascii');
      return Buffer.concat([header, payload]);
    };
    const brands = Buffer.concat([
      Buffer.from('isom', 'ascii'),
      Buffer.from([0, 0, 2, 0]),
      Buffer.from('isomiso2mp41', 'ascii'),
    ]);
    return Buffer.concat([box('ftyp', brands), box('mdat', Buffer.alloc(64))]);
  }

  it('uploads a video as-is, without putting it through the image pipeline', async () => {
    const uploadRes = await agent
      .post('/media')
      .field('siteId', siteId)
      .attach('file', mp4Buffer(), 'clip.mp4')
      .expect(201);

    // Not converted to WebP, unlike every image: sharp cannot read a
    // video, so it is stored exactly as uploaded (ADR-0054).
    expect(uploadRes.body.storageKey).toMatch(/\.mp4$/);
    expect(uploadRes.body.mimeType).toBe('video/mp4');
    uploadedStorageKeys.push(uploadRes.body.storageKey);

    const servedRes = await request(app.getHttpServer())
      .get(`/uploads/${uploadRes.body.storageKey}`)
      .expect(200);
    expect(servedRes.headers['content-type']).toContain('video/mp4');
    // Served inline, deliberately — a <video> cannot play a file the
    // server told the browser to download — with nosniff as the guard
    // that its type is taken as declared.
    expect(servedRes.headers['x-content-type-options']).toBe('nosniff');
    expect(servedRes.headers['content-disposition']).toBeUndefined();
  });

  /*
   * The library used to refuse this. It now takes any file (ADR-0070), and
   * what has to hold instead is that nothing whose bytes proved nothing
   * is ever opened in place: the declared type says video, the name says
   * video, the content is a script — so it is kept, and only downloadable.
   */
  it('takes a script disguised as a video, but only ever as a download', async () => {
    const uploadRes = await agent
      .post('/media')
      .field('siteId', siteId)
      .attach('file', Buffer.from('<svg onload="alert(1)">'), {
        filename: 'clip.mp4',
        contentType: 'video/mp4',
      })
      .expect(201);
    uploadedStorageKeys.push(uploadRes.body.storageKey);

    expect(uploadRes.body.storageKey).toMatch(/^files\/[^/]+\/clip\.mp4$/);
    const servedRes = await request(app.getHttpServer())
      .get(`/uploads/${uploadRes.body.storageKey}`)
      .expect(200);
    expect(servedRes.headers['content-disposition']).toBe('attachment');
    expect(servedRes.headers['x-content-type-options']).toBe('nosniff');
  });

  it('takes a PDF as a document, under the name it was uploaded with', async () => {
    const uploadRes = await agent
      .post('/media')
      .field('siteId', siteId)
      .attach('file', Buffer.from('%PDF-1.7\n'), 'Listino 2026.pdf')
      .expect(201);
    uploadedStorageKeys.push(uploadRes.body.storageKey);

    expect(uploadRes.body.mimeType).toBe('application/pdf');
    expect(uploadRes.body.storageKey).toMatch(
      /^files\/[^/]+\/Listino-2026\.pdf$/,
    );
  });

  /*
   * The rule used to hang off the URL prefix, and the URL is not the
   * file: `%66iles` does not match `/uploads/files`, falls through to the
   * general mount, and is decoded back to the very same file — served
   * inline. Found by trying it against the running API on 2026-09-13.
   */
  it('keeps an uploaded HTML file a download however its address is spelled', async () => {
    const uploadRes = await agent
      .post('/media')
      .field('siteId', siteId)
      .attach('file', Buffer.from('<script>alert(1)</script>'), 'page.html')
      .expect(201);
    uploadedStorageKeys.push(uploadRes.body.storageKey);
    const key: string = uploadRes.body.storageKey;

    for (const address of [
      `/uploads/${key}`,
      `/uploads/${key.replace(/^files/, '%66iles')}`,
      `/uploads/${key.replace(/^files/, '%66%69%6c%65%73')}`,
      `/uploads/./${key}`,
    ]) {
      const res = await request(app.getHttpServer()).get(address);
      // Either it is not found, or it is a download. Never a page.
      if (res.status === 200) {
        expect({
          address,
          disposition: res.headers['content-disposition'],
        }).toEqual({ address, disposition: 'attachment' });
      } else {
        expect(res.status).toBe(404);
      }
    }
  });

  it('keeps a form attachment a download under a disguised address too', async () => {
    const uploadDir = process.env.MEDIA_UPLOAD_DIR as string;
    const name = `${randomUUID()}.pdf`;
    await mkdir(join(uploadDir, 'attachments'), { recursive: true });
    await writeFile(join(uploadDir, 'attachments', name), '%PDF-1.7\n');
    try {
      const res = await request(app.getHttpServer())
        .get(`/uploads/%61ttachments/${name}`)
        .expect(200);
      expect(res.headers['content-disposition']).toBe('attachment');
    } finally {
      await unlink(join(uploadDir, 'attachments', name)).catch(() => undefined);
    }
  });

  it('deletes a downloadable file and the directory it was kept in', async () => {
    const uploadRes = await agent
      .post('/media')
      .field('siteId', siteId)
      .attach('file', Buffer.from('ciao'), 'nota.txt')
      .expect(201);
    const key: string = uploadRes.body.storageKey;

    await agent.delete(`/media/${uploadRes.body.id}`).expect(204);

    const uploadDir = process.env.MEDIA_UPLOAD_DIR as string;
    await expect(stat(join(uploadDir, dirname(key)))).rejects.toThrow();
  });

  it('400s an image that cannot be read, with a sentence, and stores nothing', async () => {
    const good = await pngBuffer(40, 40);
    // Its signature is a PNG's, so it is taken for an image — and the bytes
    // after it are not: cut in half, a byte flipped, and plain text.
    const broken = {
      truncated: good.subarray(0, Math.floor(good.length / 2)),
      flipped: Buffer.from(
        good.map((b, i) => (i === good.length - 20 ? b ^ 0xff : b)),
      ),
      'text after the signature': Buffer.concat([
        good.subarray(0, 16),
        Buffer.from('not a picture, only bytes'),
      ]),
    };
    const before = await agent.get('/media').query({ siteId }).expect(200);

    for (const [what, data] of Object.entries(broken)) {
      const res = await agent
        .post('/media')
        .field('siteId', siteId)
        .attach('file', data, `rotta-${what.replace(/ /g, '-')}.png`);
      expect([what, res.status]).toEqual([what, 400]);
      expect(res.body.message).toMatch(/could not be read as an image/i);
    }

    const after = await agent.get('/media').query({ siteId }).expect(200);
    expect(after.body.total).toBe(before.body.total);
  });

  it('400s with no file attached', async () => {
    await agent.post('/media').field('siteId', siteId).expect(400);
  });

  it('lists uploaded media for a site, newest first', async () => {
    const data = await pngBuffer(200, 200);
    const res = await agent
      .post('/media')
      .field('siteId', siteId)
      .attach('file', data, 'seconda-foto.png')
      .expect(201);
    uploadedStorageKeys.push(res.body.storageKey);

    const listRes = await agent.get('/media').query({ siteId }).expect(200);

    expect(listRes.body.total).toBeGreaterThanOrEqual(2);
    expect(listRes.body.items[0].storageKey).toBe(res.body.storageKey);
  });

  it('deletes media and it stops being served', async () => {
    const data = await pngBuffer(150, 150);
    const uploadRes = await agent
      .post('/media')
      .field('siteId', siteId)
      .attach('file', data, 'da-cancellare.png')
      .expect(201);

    await agent.delete(`/media/${uploadRes.body.id}`).expect(204);

    await request(app.getHttpServer())
      .get(`/uploads/${uploadRes.body.storageKey}`)
      .expect(404);
  });

  it("counts the site's files by kind, for the library's folders", async () => {
    const pdf = await agent
      .post('/media')
      .field('siteId', siteId)
      .attach('file', Buffer.from('%PDF-1.7\n'), 'da-contare.pdf')
      .expect(201);
    uploadedStorageKeys.push(pdf.body.storageKey);

    const res = await agent.get('/media/kinds').query({ siteId }).expect(200);

    expect(Object.keys(res.body).sort()).toEqual([
      'audio',
      'document',
      'image',
      'other',
      'video',
    ]);
    expect(res.body.document).toBeGreaterThanOrEqual(1);
    // And the number is the folder's own contents, not a separate guess.
    const listed = await agent
      .get('/media')
      .query({ siteId, kind: 'document', pageSize: 100 })
      .expect(200);
    expect(res.body.document).toBe(listed.body.total);
  });

  describe('one file, its name and its alternative text', () => {
    async function uploadPdf(name: string) {
      const res = await agent
        .post('/media')
        .field('siteId', siteId)
        .attach('file', Buffer.from('%PDF-1.7\n'), name)
        .expect(201);
      uploadedStorageKeys.push(res.body.storageKey);
      return res.body as { id: string; filename: string };
    }

    it('reads one file by its id — what a link that names it needs', async () => {
      const file = await uploadPdf('un-file.pdf');

      const res = await agent.get(`/media/${file.id}`).expect(200);

      expect(res.body.id).toBe(file.id);
      expect(res.body.alt).toBe('');
      await agent.get(`/media/${randomUUID()}`).expect(404);
    });

    it('does not mistake the folders route for a file', async () => {
      await agent.get('/media/kinds').query({ siteId }).expect(200);
    });

    it('renames a file and writes its alternative text, and the library finds it by the new name', async () => {
      const file = await uploadPdf('nome-vecchio.pdf');

      const res = await agent
        .patch(`/media/${file.id}`)
        .send({ filename: 'listino-prezzi-zz.pdf', alt: 'Il listino' })
        .expect(200);

      expect(res.body.filename).toBe('listino-prezzi-zz.pdf');
      expect(res.body.alt).toBe('Il listino');
      const found = await agent
        .get('/media')
        .query({ siteId, search: 'listino-prezzi-zz' })
        .expect(200);
      expect(found.body.items.map((m: { id: string }) => m.id)).toEqual([
        file.id,
      ]);
    });

    it('changes one of the two and leaves the other', async () => {
      const file = await uploadPdf('solo-alt.pdf');
      await agent.patch(`/media/${file.id}`).send({ alt: 'Testo' }).expect(200);

      const res = await agent
        .patch(`/media/${file.id}`)
        .send({ filename: 'solo-alt-2.pdf' })
        .expect(200);

      expect([res.body.filename, res.body.alt]).toEqual([
        'solo-alt-2.pdf',
        'Testo',
      ]);
    });

    it('400s a name that is a path, an empty one, and a request that changes nothing', async () => {
      const file = await uploadPdf('da-non-rompere.pdf');

      await agent
        .patch(`/media/${file.id}`)
        .send({ filename: '../fuori.pdf' })
        .expect(400);
      await agent
        .patch(`/media/${file.id}`)
        .send({ filename: '   ' })
        .expect(400);
      await agent.patch(`/media/${file.id}`).send({}).expect(400);

      const still = await agent.get(`/media/${file.id}`).expect(200);
      expect(still.body.filename).toBe('da-non-rompere.pdf');
    });

    it('404s renaming a file that does not exist', async () => {
      await agent
        .patch(`/media/${randomUUID()}`)
        .send({ filename: 'x.pdf' })
        .expect(404);
    });

    it('lets an editor rename — it is a draft-level change, like an upload', async () => {
      const file = await uploadPdf('da-editor.pdf');
      const editorAgent = await integration.login(
        await integration.createUser({ role: 'editor' }),
      );

      await editorAgent
        .patch(`/media/${file.id}`)
        .send({ filename: 'da-editor-2.pdf' })
        .expect(200);
    });

    it('says where a file is used — nowhere, for one just uploaded', async () => {
      const file = await uploadPdf('mai-usato.pdf');

      const res = await agent.get(`/media/${file.id}/usages`).expect(200);

      expect(res.body).toEqual({ pages: [], sections: [], layout: [] });
      await agent.get(`/media/${randomUUID()}/usages`).expect(404);
    });
  });

  it('404s deleting media that does not exist', async () => {
    await agent.delete(`/media/${randomUUID()}`).expect(404);
  });

  it('401s without a session cookie', async () => {
    await request(app.getHttpServer())
      .get('/media')
      .query({ siteId })
      .expect(401);
  });
});

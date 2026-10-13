import { readdir } from 'node:fs/promises';
import request from 'supertest';
import sharp from 'sharp';
import { MediaModule } from './media.module';
import { IntegrationApp } from '../../test/integration-app.test-fixture';

/**
 * A disk with less room than the server keeps back for itself refuses the
 * upload, through the real stack (docs/adr/0120): 507 with a sentence a person
 * can read, and nothing written. The room asked for is more than any disk has,
 * so the answer does not depend on the machine this runs on.
 */
describe('Uploads to a disk with no room kept back (integration)', () => {
  let integration: IntegrationApp;
  let agent: ReturnType<typeof request.agent>;
  let siteId: string;
  const previous = process.env.MEDIA_MIN_FREE_MB;

  beforeAll(async () => {
    process.env.MEDIA_MIN_FREE_MB = '1000000000000'; // a million terabytes
    integration = await IntegrationApp.start({ imports: [MediaModule] });
    siteId = await integration.createSite();
    agent = await integration.login(await integration.createUser());
  });

  afterAll(async () => {
    if (previous === undefined) delete process.env.MEDIA_MIN_FREE_MB;
    else process.env.MEDIA_MIN_FREE_MB = previous;
    await integration.close();
  });

  it('answers 507 in words, and writes nothing', async () => {
    const uploadDir = process.env.MEDIA_UPLOAD_DIR as string;
    const before = await readdir(uploadDir).catch(() => []);
    const png = await sharp({
      create: {
        width: 40,
        height: 30,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    })
      .png()
      .toBuffer();

    const res = await agent
      .post('/media')
      .field('siteId', siteId)
      .attach('file', png, 'foto.png')
      .expect(507);

    expect(res.body.message).toMatch(/not enough room left on this server/);
    expect(await readdir(uploadDir).catch(() => [])).toEqual(before);
  });
});

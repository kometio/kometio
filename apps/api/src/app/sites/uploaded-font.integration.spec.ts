import { dirname, join } from 'node:path';
import { rmdir, unlink } from 'node:fs/promises';
import request from 'supertest';
import { mediaRecordSchema } from '@kometio/api-contracts';
import { requireEnv } from '@kometio/env-config';
import { MediaModule } from '../media/media.module';
import { SitesModule } from './sites.module';
import { IntegrationApp } from '../../test/integration-app.test-fixture';

/**
 * A site draws its pages with a font it uploaded (docs/adr/0147): the files
 * are its own library's, web fonts, and their addresses are the server's to
 * say. Runs against a real Postgres — see docs/development.md.
 */
describe('A font the site uploaded (integration)', () => {
  let integration: IntegrationApp;
  let agent: ReturnType<typeof request.agent>;
  let siteId: string;
  const uploadedStorageKeys: string[] = [];

  beforeAll(async () => {
    integration = await IntegrationApp.start({
      imports: [MediaModule, SitesModule],
    });
    siteId = await integration.createSite();
    agent = await integration.login(await integration.createUser());
  });

  afterAll(async () => {
    const uploadDir = requireEnv('MEDIA_UPLOAD_DIR');
    for (const key of uploadedStorageKeys) {
      await unlink(join(uploadDir, key)).catch(() => undefined);
      if (key.startsWith('files/')) {
        await rmdir(join(uploadDir, dirname(key))).catch(() => undefined);
      }
    }
    await integration.close();
  });

  async function upload(data: Buffer, name: string) {
    const res = await agent
      .post('/media')
      .field('siteId', siteId)
      .attach('file', data, name)
      .expect(201);
    const media = mediaRecordSchema.parse(res.body);
    uploadedStorageKeys.push(media.storageKey);
    return media;
  }

  function settings(overrides: Record<string, unknown>) {
    return {
      primaryColor: null,
      secondaryColor: null,
      fontFamily: 'uploaded',
      customCss: null,
      contentWidth: null,
      headScript: null,
      bodyScript: null,
      faviconUrl: null,
      uploadedFont: null,
      overridesEnabled: true,
      motionEnabled: true,
      allowedTrackerDomains: [],
      trackerScripts: [],
      ...overrides,
    };
  }

  it('keeps the font with the address the library serves its file from, whatever was sent', async () => {
    const font = await upload(
      Buffer.concat([Buffer.from('wOF2', 'ascii'), Buffer.alloc(60)]),
      'Biscotto.woff2',
    );

    const res = await agent
      .patch(`/sites/${siteId}/theme-settings`)
      .send(
        settings({
          uploadedFont: {
            family: 'Biscotto',
            faces: [
              {
                mediaId: font.id,
                url: 'http://169.254.169.254/latest/meta-data',
                weight: 'variable',
                style: 'normal',
              },
            ],
          },
        }),
      )
      .expect(200);

    expect(res.body.themeFontFamily).toBe('uploaded');
    expect(res.body.themeUploadedFont.faces[0].url).toBe(font.url);
    const reread = await agent.get(`/sites/${siteId}`).expect(200);
    expect(reread.body.themeUploadedFont.family).toBe('Biscotto');
  });

  it('refuses a file of the library that is not a web font', async () => {
    const notAFont = await upload(
      Buffer.from('%PDF-1.7 listino'),
      'listino.pdf',
    );

    await agent
      .patch(`/sites/${siteId}/theme-settings`)
      .send(
        settings({
          uploadedFont: {
            family: 'Listino',
            faces: [
              {
                mediaId: notAFont.id,
                url: notAFont.url,
                weight: '400',
                style: 'normal',
              },
            ],
          },
        }),
      )
      .expect(400);
  });

  it('refuses "the uploaded font" when there is none', async () => {
    await agent
      .patch(`/sites/${siteId}/theme-settings`)
      .send(settings({ uploadedFont: null }))
      .expect(400);
  });

  it('refuses two files with the same weight and style', async () => {
    const font = await upload(
      Buffer.concat([Buffer.from('wOF2', 'ascii'), Buffer.alloc(60)]),
      'Biscotto-Again.woff2',
    );
    const face = {
      mediaId: font.id,
      url: font.url,
      weight: '400',
      style: 'normal',
    };

    await agent
      .patch(`/sites/${siteId}/theme-settings`)
      .send(
        settings({ uploadedFont: { family: 'Biscotto', faces: [face, face] } }),
      )
      .expect(400);
  });
});

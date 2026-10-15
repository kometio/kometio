import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { STARTER_IDS, type StarterId } from '@kometio/shared-types';
import { IntegrationApp } from '../../test/integration-app.test-fixture';
import { CollectionsModule } from '../collections/collections.module';
import { FormsModule } from '../forms/forms.module';
import { PagesModule } from '../pages/pages.module';
import { SitesModule } from '../sites/sites.module';
import { SiteLayoutSectionsModule } from '../site-layout-sections/site-layout-sections.module';
import { TaxonomiesModule } from '../taxonomies/taxonomies.module';
import { StartersModule } from './starters.module';

type Agent = ReturnType<typeof request.agent>;

/**
 * A new site's starting points (docs/adr/0136) over HTTP against a real
 * Postgres: each of the three made on a site as the wizard leaves it, and
 * what the database then holds. The unit specs have the rules; this has the
 * statements, which are the part an in-memory repository cannot say anything
 * about (an address that is taken, a foreign key, a unique index).
 */
describe('starting points (integration)', () => {
  let integration: IntegrationApp;
  let admin: Agent;
  let editor: Agent;

  beforeAll(async () => {
    integration = await IntegrationApp.start({
      imports: [
        StartersModule,
        SitesModule,
        PagesModule,
        FormsModule,
        CollectionsModule,
        TaxonomiesModule,
        SiteLayoutSectionsModule,
      ],
    });
    admin = await integration.login(await integration.createUser());
    editor = await integration.login(
      await integration.createUser({ role: 'editor' }),
    );
  });

  afterAll(async () => {
    await integration.close();
  });

  /** A site as the first-run wizard leaves it: its name on a published home page. */
  async function aNewSite(
    locale = 'it',
  ): Promise<{ siteId: string; name: string; homeId: string }> {
    const name = `Casa Azzurra ${randomUUID().slice(0, 8)}`;
    const siteId = await integration.createSite({
      name,
      defaultLocale: locale,
      enabledLocales: [locale],
    });
    const group = await admin
      .post('/page-groups')
      .send({
        siteId,
        content: [
          {
            id: randomUUID(),
            type: 'Hero',
            props: { title: name, subtitle: '' },
          },
        ],
      })
      .expect(201);
    const translation = await admin
      .post(`/page-groups/${group.body.id}/translations`)
      .send({
        locale,
        slug: 'home',
        seoMeta: { title: name, description: '' },
      })
      .expect(201);
    await admin
      .post(`/page-groups/translations/${translation.body.id}/publish`)
      .expect(201);
    return { siteId, name, homeId: group.body.id };
  }

  async function pagesOf(siteId: string) {
    const list = await admin
      .get('/page-groups')
      .query({ siteId, page: 1, pageSize: 100 })
      .expect(200);
    return list.body.items as {
      id: string;
      parentId: string | null;
      collectionId: string | null;
      translations: { slug: string; locale: string; status: string }[];
    }[];
  }

  describe('who may', () => {
    it('refuses anyone without a session', async () => {
      const siteId = randomUUID();
      await request(integration.app.getHttpServer())
        .get(`/sites/${siteId}/starters`)
        .expect(401);
      await request(integration.app.getHttpServer())
        .post(`/sites/${siteId}/starters`)
        .send({ starterId: 'studio' })
        .expect(401);
    });

    it('refuses an editor, who may write drafts and not change the site', async () => {
      const { siteId } = await aNewSite();

      await editor.get(`/sites/${siteId}/starters`).expect(403);
      await editor
        .post(`/sites/${siteId}/starters`)
        .send({ starterId: 'studio' })
        .expect(403);
    });
  });

  describe('what is offered', () => {
    it('says a new site can have one, in its own language', async () => {
      const { siteId } = await aNewSite('it');

      const offer = await admin.get(`/sites/${siteId}/starters`).expect(200);

      expect(offer.body).toEqual({
        available: true,
        language: 'it',
        fallback: false,
        starters: [...STARTER_IDS],
      });
    });

    it('says when the language of the site has no text of its own', async () => {
      const { siteId } = await aNewSite('fr');

      const offer = await admin.get(`/sites/${siteId}/starters`).expect(200);

      expect(offer.body).toMatchObject({
        available: true,
        language: 'en',
        fallback: true,
      });
    });

    it('answers 404 for a site that is not there', async () => {
      await admin.get(`/sites/${randomUUID()}/starters`).expect(404);
    });
  });

  describe('what is made', () => {
    it('refuses a starter this installation does not have', async () => {
      const { siteId } = await aNewSite();

      await admin
        .post(`/sites/${siteId}/starters`)
        .send({ starterId: 'shop' })
        .expect(400);
    });

    it.each(STARTER_IDS)(
      'makes the %s starter, every page published, and then is not offered again',
      async (starterId: StarterId) => {
        const { siteId, homeId } = await aNewSite();

        const made = await admin
          .post(`/sites/${siteId}/starters`)
          .send({ starterId })
          .expect(201);
        const pages = await pagesOf(siteId);

        expect(made.body).toMatchObject({
          starterId,
          language: 'it',
          fallback: false,
        });
        expect(made.body.pages).toBe(pages.length);
        expect(pages.length).toBeGreaterThan(2);
        for (const page of pages) {
          expect(page.translations).toHaveLength(1);
          expect(page.translations[0]).toMatchObject({
            locale: 'it',
            status: 'published',
          });
        }
        // The wizard's home page is the starter's, at the address it had.
        const home = pages.find((page) => page.id === homeId);
        expect(home?.translations[0]?.slug).toBe('home');

        const offer = await admin.get(`/sites/${siteId}/starters`).expect(200);
        expect(offer.body.available).toBe(false);
      },
    );

    it('puts the site on the theme the starter was drawn for', async () => {
      const { siteId } = await aNewSite();
      await admin
        .post(`/sites/${siteId}/starters`)
        .send({ starterId: 'blog' })
        .expect(201);

      const site = await admin.get(`/sites/${siteId}`).expect(200);

      expect(site.body.themeName).toBe('paper');
    });

    it('refuses a second one, and leaves what the first made as it was', async () => {
      const { siteId } = await aNewSite();
      await admin
        .post(`/sites/${siteId}/starters`)
        .send({ starterId: 'portfolio' })
        .expect(201);
      const before = await pagesOf(siteId);

      await admin
        .post(`/sites/${siteId}/starters`)
        .send({ starterId: 'studio' })
        .expect(409);

      expect((await pagesOf(siteId)).length).toBe(before.length);
    });

    it('refuses a site whose home page has been written', async () => {
      const { siteId, homeId } = await aNewSite();
      await admin
        .patch(`/page-groups/${homeId}/content`)
        .send({
          content: [
            { id: randomUUID(), type: 'Text', props: { body: '<p>Mine</p>' } },
          ],
        })
        .expect(200);

      await admin
        .post(`/sites/${siteId}/starters`)
        .send({ starterId: 'studio' })
        .expect(409);
    });

    it('makes the studio’s contact form, the header and the footer', async () => {
      const { siteId } = await aNewSite();

      await admin
        .post(`/sites/${siteId}/starters`)
        .send({ starterId: 'studio' })
        .expect(201);

      const forms = await admin.get('/forms').query({ siteId }).expect(200);
      expect(forms.body.items).toHaveLength(1);
      expect(
        forms.body.items[0].fields.map((field: { type: string }) => field.type),
      ).toEqual(['text', 'email', 'textarea']);
      for (const kind of ['header', 'footer']) {
        const section = await admin
          .get('/site-layout-sections')
          .query({ siteId, locale: 'it', kind })
          .expect(200);
        expect(section.body.status).toBe('published');
        expect(section.body.publishedContent.length).toBeGreaterThan(0);
      }
    });

    it('makes the blog’s section, its category and files each article in both', async () => {
      const { siteId } = await aNewSite();

      await admin
        .post(`/sites/${siteId}/starters`)
        .send({ starterId: 'blog' })
        .expect(201);

      const collections = await admin
        .get('/collections')
        .query({ siteId })
        .expect(200);
      const taxonomies = await admin
        .get('/taxonomies')
        .query({ siteId })
        .expect(200);
      const pages = await pagesOf(siteId);
      const articles = pages.filter(
        (page) => page.collectionId === collections.body[0].id,
      );

      expect(collections.body).toHaveLength(1);
      expect(taxonomies.body).toHaveLength(1);
      expect(articles).toHaveLength(3);
      for (const article of articles) {
        const terms = await admin
          .get(`/page-groups/${article.id}/terms`)
          .expect(200);
        expect(terms.body.termIds).toHaveLength(1);
      }
    });

    it('writes it in English for an English site', async () => {
      const { siteId } = await aNewSite('en');

      const made = await admin
        .post(`/sites/${siteId}/starters`)
        .send({ starterId: 'studio' })
        .expect(201);
      const slugs = (await pagesOf(siteId)).flatMap((page) =>
        page.translations.map((translation) => translation.slug),
      );

      expect(made.body).toMatchObject({ language: 'en', fallback: false });
      expect(slugs).toContain('services');
    });
  });
});

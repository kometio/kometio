import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DEFAULT_COOKIE_BANNER_SETTINGS } from '@kometio/shared-types';
import { AccountModule } from '../account/account.module';
import { CollectionsModule } from '../collections/collections.module';
import { PagesModule } from '../pages/pages.module';
import { TaxonomiesModule } from '../taxonomies/taxonomies.module';
import { SiteLayoutSectionsModule } from '../site-layout-sections/site-layout-sections.module';
import { PublicPagesModule } from './public-pages.module';
import { IntegrationApp } from '../../test/integration-app.test-fixture';

/**
 * Runs against a real Postgres — see docs/development.md. Combines
 * PagesModule (to create/publish page GROUPS the normal, authenticated way
 * — via /page-groups, i18n a livello di campo, see the plan) with
 * PublicPagesModule under test, then reads them back through the public
 * endpoint with NO session at all — that's the actual thing being verified:
 * a real visitor, not the admin agent, can reach published content and
 * nothing else.
 *
 * Uses its own throwaway site under DEFAULT_TENANT_ID, same reasoning as
 * pages.controller.integration.spec.ts: keeps this suite's data out of the
 * site the dev editor-app displays.
 */
describe('PublicPagesController (integration)', () => {
  let integration: IntegrationApp;
  let app: INestApplication;
  let agent: ReturnType<typeof request.agent>;
  let siteId: string;
  let domain: string;
  let userId: string;

  beforeAll(async () => {
    integration = await IntegrationApp.start({
      imports: [
        PagesModule,
        SiteLayoutSectionsModule,
        PublicPagesModule,
        TaxonomiesModule,
        CollectionsModule,
        AccountModule,
      ],
    });
    app = integration.app;
    domain = `public-test-${randomUUID()}.example.test`;
    siteId = await integration.createSite({
      name: 'Public Test Site',
      domain,
      enabledLocales: ['it'],
    });
    const user = await integration.createUser();
    userId = user.id;
    agent = await integration.login(user);
  });

  afterAll(async () => {
    await integration.close();
  });

  /** Creates a group + one 'it' translation, publishes it, returns both ids. */
  async function createAndPublishPage(
    slug: string,
    content: unknown[] = [],
    title = 'Title',
  ) {
    const groupRes = await agent
      .post('/page-groups')
      .send({ siteId, content })
      .expect(201);
    const translationRes = await agent
      .post(`/page-groups/${groupRes.body.id}/translations`)
      .send({ locale: 'it', slug, seoMeta: { title, description: '' } })
      .expect(201);
    await agent
      .post(`/page-groups/translations/${translationRes.body.id}/publish`)
      .expect(201);
    return { groupId: groupRes.body.id, translationId: translationRes.body.id };
  }

  it('serves published content for a slug on the matching domain, without a session', async () => {
    await createAndPublishPage(
      'chi-siamo',
      [{ type: 'Hero', props: { title: 'Ciao' } }],
      'Chi siamo',
    );

    const res = await request(app.getHttpServer())
      .get('/public/pages/by-slug')
      .query({ domain, locale: 'it', path: 'chi-siamo' })
      .expect(200);

    expect(res.body).toEqual({
      // The page translation's id, on the wire — what a form submitted
      // from this page sends back as its origin (ADR-0079).
      id: expect.any(String),
      content: [{ type: 'Hero', props: { title: 'Ciao' } }],
      seoMeta: { title: 'Chi siamo', description: '' },
      locale: 'it',
      translations: [{ locale: 'it', slug: 'chi-siamo', ancestorSlugs: [] }],
      ancestors: [],
      header: null,
      footer: null,
      headerSticky: false,
      site: {
        name: 'Public Test Site',
        domain,
        themeName: 'classic',
        defaultLocale: 'it',
        enabledLocales: ['it'],
        untranslatedPageFallback: 'redirect-to-default',
        businessAddress: null,
        businessPhone: null,
        businessEmail: null,
        businessType: null,
        openingHours: null,
        searchEngineIndexingEnabled: false,
        themeSettings: {
          primaryColor: null,
          secondaryColor: null,
          fontFamily: null,
          customCss: null,
          contentWidth: null,
          headScript: null,
          bodyScript: null,
          faviconUrl: null,
          overridesEnabled: true,
          allowedTrackerDomains: [],
          trackerScripts: [],
        },
        themeTokens: {
          blockStyles: {},
        },
        cookieBannerSettings: DEFAULT_COOKIE_BANNER_SETTINGS,
        privacyPolicySlug: null,
        cookiePolicySlug: null,
      },
    });
  });

  it("resolves a NavLink's page reference to the CURRENT locale's own path over the real public HTTP endpoint", async () => {
    // Real bug, found live during this session's own investigation: `page`
    // isn't a translatable field, so a locale-specific slug baked in at
    // pick time got reused verbatim for every locale of the containing
    // block — an IT reader could get an EN link. `page` is now
    // locale-independent ({pageGroupId, title}), resolved fresh for
    // whichever locale is actually being rendered.
    // A site of its own that offers both languages: the suite's site offers
    // only Italian, which the fallback tests below depend on.
    const bilingualDomain = `public-test-${randomUUID()}.example.test`;
    const bilingualSiteId = await integration.createSite({
      name: 'Bilingual Test Site',
      domain: bilingualDomain,
      enabledLocales: ['it', 'en'],
    });
    const docsGroupRes = await agent
      .post('/page-groups')
      .send({ siteId: bilingualSiteId, content: [] })
      .expect(201);
    const docsItRes = await agent
      .post(`/page-groups/${docsGroupRes.body.id}/translations`)
      .send({
        locale: 'it',
        slug: 'documentazione',
        seoMeta: { title: 'Documentazione', description: '' },
      })
      .expect(201);
    await agent
      .post(`/page-groups/translations/${docsItRes.body.id}/publish`)
      .expect(201);
    const docsEnRes = await agent
      .post(`/page-groups/${docsGroupRes.body.id}/translations`)
      .send({
        locale: 'en',
        slug: 'docs',
        seoMeta: { title: 'Docs', description: '' },
      })
      .expect(201);
    await agent
      .post(`/page-groups/translations/${docsEnRes.body.id}/publish`)
      .expect(201);

    const homeGroupRes = await agent
      .post('/page-groups')
      .send({
        siteId: bilingualSiteId,
        content: [
          {
            id: 'nav-1',
            type: 'NavLink',
            props: {
              label: 'Docs',
              linkType: 'page',
              page: {
                pageGroupId: docsGroupRes.body.id,
                title: 'Documentazione',
              },
              url: '',
            },
          },
        ],
      })
      .expect(201);
    const homeItRes = await agent
      .post(`/page-groups/${homeGroupRes.body.id}/translations`)
      .send({
        locale: 'it',
        slug: `home-it-${randomUUID()}`,
        seoMeta: { title: 'Home', description: '' },
      })
      .expect(201);
    await agent
      .post(`/page-groups/translations/${homeItRes.body.id}/publish`)
      .expect(201);
    const homeEnRes = await agent
      .post(`/page-groups/${homeGroupRes.body.id}/translations`)
      .send({
        locale: 'en',
        slug: `home-en-${randomUUID()}`,
        seoMeta: { title: 'Home', description: '' },
      })
      .expect(201);
    await agent
      .post(`/page-groups/translations/${homeEnRes.body.id}/publish`)
      .expect(201);

    const itRes = await request(app.getHttpServer())
      .get('/public/pages/by-slug')
      .query({
        domain: bilingualDomain,
        locale: 'it',
        path: homeItRes.body.slug,
      })
      .expect(200);
    const enRes = await request(app.getHttpServer())
      .get('/public/pages/by-slug')
      .query({
        domain: bilingualDomain,
        locale: 'en',
        path: homeEnRes.body.slug,
      })
      .expect(200);

    expect(itRes.body.content[0].props.page).toMatchObject({
      locale: 'it',
      slug: 'documentazione',
    });
    expect(enRes.body.content[0].props.page).toMatchObject({
      locale: 'en',
      slug: 'docs',
    });
  });

  it("bundles the published header/footer for the page's (site, locale), without a session", async () => {
    await createAndPublishPage('con-header', [], 'Con header');

    const headerRes = await agent
      .get('/site-layout-sections')
      .query({ siteId, locale: 'it', kind: 'header' })
      .expect(200);
    await agent
      .patch(`/site-layout-sections/${headerRes.body.id}/draft`)
      .send({ content: [{ type: 'Header', props: {} }] })
      .expect(200);
    await agent
      .post(`/site-layout-sections/${headerRes.body.id}/publish`)
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/public/pages/by-slug')
      .query({ domain, locale: 'it', path: 'con-header' })
      .expect(200);

    expect(res.body.header).toEqual([{ type: 'Header', props: {} }]);
    expect(res.body.footer).toBeNull();
    expect(res.body.headerSticky).toBe(false);
  });

  it('propagates a published sticky header over the public HTTP endpoint', async () => {
    await createAndPublishPage('con-header-sticky', [], 'Con header sticky');

    const headerRes = await agent
      .get('/site-layout-sections')
      .query({ siteId, locale: 'it', kind: 'header' })
      .expect(200);
    await agent
      .patch(`/site-layout-sections/${headerRes.body.id}/draft`)
      .send({ content: [{ type: 'Header', props: {} }] })
      .expect(200);
    await agent
      .post(`/site-layout-sections/${headerRes.body.id}/publish`)
      .expect(201);
    await agent
      .patch(`/site-layout-sections/${headerRes.body.id}/sticky`)
      .send({ sticky: true })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/public/pages/by-slug')
      .query({ domain, locale: 'it', path: 'con-header-sticky' })
      .expect(200);

    expect(res.body.headerSticky).toBe(true);
  });

  it('/public/pages/chrome bundles the published header/footer with no page in the picture', async () => {
    // Fresh locale, not 'it' — a page-less route can't inherit header/
    // footer state other tests in this file already published at 'it'.
    const locale = `it-${randomUUID()}`;
    const headerRes = await agent
      .get('/site-layout-sections')
      .query({ siteId, locale, kind: 'header' })
      .expect(200);
    await agent
      .patch(`/site-layout-sections/${headerRes.body.id}/draft`)
      .send({ content: [{ type: 'Header', props: {} }] })
      .expect(200);
    await agent
      .post(`/site-layout-sections/${headerRes.body.id}/publish`)
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/public/pages/chrome')
      .query({ domain, locale })
      .expect(200);

    expect(res.body.header).toEqual([{ type: 'Header', props: {} }]);
    expect(res.body.footer).toBeNull();
    expect(res.body.site.name).toBe('Public Test Site');
  });

  it("/public/pages/chrome falls back to the site's default locale (it) header/footer for a locale with nothing of its own configured", async () => {
    // Regression: a locale that never got its own header/footer section
    // used to render with NEITHER (found live on a real multi-locale site —
    // the English page lost its nav and footer entirely). The site's own
    // 'it' header is (re)published here with a distinctive payload so this
    // assertion is self-contained, independent of what any earlier test in
    // this file left behind at 'it'.
    const headerRes = await agent
      .get('/site-layout-sections')
      .query({ siteId, locale: 'it', kind: 'header' })
      .expect(200);
    await agent
      .patch(`/site-layout-sections/${headerRes.body.id}/draft`)
      .send({ content: [{ type: 'Header', props: { fallbackCheck: true } }] })
      .expect(200);
    await agent
      .post(`/site-layout-sections/${headerRes.body.id}/publish`)
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/public/pages/chrome')
      .query({ domain, locale: `it-${randomUUID()}` })
      .expect(200);

    expect(res.body.header).toEqual([
      { type: 'Header', props: { fallbackCheck: true } },
    ]);
  });

  it('/public/pages/chrome 404s for a domain that does not match any site', async () => {
    await request(app.getHttpServer())
      .get('/public/pages/chrome')
      .query({ domain: 'nobody-has-this.example.test', locale: 'it' })
      .expect(404);
  });

  it('404s for a page that has never been published, same as a nonexistent one', async () => {
    const groupRes = await agent
      .post('/page-groups')
      .send({ siteId, content: [] })
      .expect(201);
    await agent
      .post(`/page-groups/${groupRes.body.id}/translations`)
      .send({
        locale: 'it',
        slug: 'bozza-mai-pubblicata',
        seoMeta: { title: 'Bozza', description: '' },
      })
      .expect(201);

    await request(app.getHttpServer())
      .get('/public/pages/by-slug')
      .query({ domain, locale: 'it', path: 'bozza-mai-pubblicata' })
      .expect(404);
  });

  /*
   * A term's own page over the real HTTP endpoint (docs/adr/0064) —
   * created through the authenticated API, then read back through the
   * public one with no session at all, which is how apps/public-site
   * asks.
   */
  it('serves a term page, its list of filed pages included, without a session', async () => {
    const suffix = randomUUID().slice(0, 8);
    const taxonomy = await agent
      .post('/taxonomies')
      .send({
        siteId,
        name: { it: `Categoria ${suffix}` },
        prefix: `cat-${suffix}`,
      })
      .expect(201);
    const term = await agent
      .post(`/taxonomies/${taxonomy.body.id}/terms`)
      .send({ name: { it: `Espresso ${suffix}` } })
      .expect(201);

    const group = await agent.post('/page-groups').send({ siteId }).expect(201);
    const translation = await agent
      .post(`/page-groups/${group.body.id}/translations`)
      .send({
        locale: 'it',
        slug: `macchina-${suffix}`,
        seoMeta: { title: 'La macchina', description: '' },
      })
      .expect(201);
    await agent
      .post(`/page-groups/translations/${translation.body.id}/publish`)
      .expect(201);
    await agent
      .patch(`/page-groups/${group.body.id}/terms`)
      .send({ termIds: [term.body.id] })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/public/pages/term-by-path')
      .query({ domain, locale: 'it', path: `cat-${suffix}/espresso-${suffix}` })
      .expect(200);

    expect(res.body.term.name).toBe(`Espresso ${suffix}`);
    expect(res.body.term.hasLandingPage).toBe(false);
    // Page-shaped, so apps/public-site renders it with no new path.
    expect(res.body.site).toBeTruthy();
    const grid = res.body.content.find(
      (block: { type: string }) => block.type === 'PageGrid',
    );
    expect(grid.props.items).toEqual([
      // A card also carries a date, a summary and a picture — this test is
      // about the list reaching a reader with no session, not about them.
      expect.objectContaining({
        pageGroupId: group.body.id,
        title: 'La macchina',
        path: `/it/macchina-${suffix}`,
      }),
    ]);
  });

  it('404s for an address no term answers, and for a path too deep to be one', async () => {
    await request(app.getHttpServer())
      .get('/public/pages/term-by-path')
      .query({ domain, locale: 'it', path: 'niente/di-niente' })
      .expect(404);
    await request(app.getHttpServer())
      .get('/public/pages/term-by-path')
      .query({ domain, locale: 'it', path: 'uno/due/tre' })
      .expect(400);
  });

  it('404s for a slug that does not exist', async () => {
    await request(app.getHttpServer())
      .get('/public/pages/by-slug')
      .query({ domain, locale: 'it', path: 'non-esiste-proprio' })
      .expect(404);
  });

  // Regression, later revised: an earlier version of this fallback did NOT
  // check `enabledLocales` at all — any string in the locale segment
  // triggered a same-slug/default-locale lookup, "helpfully" redirecting
  // even a locale that was never real for this site. That broke
  // [locale]/index.astro specifically: since a "home" page exists on
  // nearly every site, ANY made-up first path segment (not just a real,
  // disabled locale) silently redirected to the homepage instead of
  // 404ing — found live-testing a themed 404 page. The rule is now
  // unconditional: a locale not in `site.enabledLocales` never gets a
  // fallback, whether it's a real language code that was removed or pure
  // garbage — a clean 404 either way (see
  // resolve-untranslated-page-fallback.spec.ts for the still-legitimate
  // case this doesn't affect: an ENABLED locale with no translation for
  // one specific page falls back to the default locale's same page).
  it('404s with fallback: null for a locale never enabled on this site, even if the same slug exists under the default locale', async () => {
    await createAndPublishPage(
      'chi-siamo-fallback',
      [{ type: 'Hero', props: { title: 'Ciao' } }],
      'Chi siamo',
    );

    const res = await request(app.getHttpServer())
      .get('/public/pages/by-slug')
      .query({ domain, locale: 'en', path: 'chi-siamo-fallback' })
      .expect(404);

    expect(res.body.fallback).toBeNull();
  });

  it('404s with fallback: null when there is no default-locale page with that slug either', async () => {
    const res = await request(app.getHttpServer())
      .get('/public/pages/by-slug')
      .query({
        domain,
        locale: 'en',
        path: 'davvero-non-esiste-da-nessuna-parte',
      })
      .expect(404);

    expect(res.body.fallback).toBeNull();
  });

  it('404s for a domain that does not match any site', async () => {
    await request(app.getHttpServer())
      .get('/public/pages/by-slug')
      .query({
        domain: 'nobody-owns-this-domain.test',
        locale: 'it',
        path: 'chi-siamo',
      })
      .expect(404);
  });

  it('400s on a malformed domain instead of hitting the database', async () => {
    await request(app.getHttpServer())
      .get('/public/pages/by-slug')
      .query({ domain: 'not a valid host!!', locale: 'it', path: 'chi-siamo' })
      .expect(400);
  });

  it('lists only published pages for the sitemap, skipping drafts, without a session', async () => {
    const draftGroupRes = await agent
      .post('/page-groups')
      .send({ siteId, content: [] })
      .expect(201);
    await agent
      .post(`/page-groups/${draftGroupRes.body.id}/translations`)
      .send({
        locale: 'it',
        slug: 'sitemap-bozza',
        seoMeta: { title: 'Bozza', description: '' },
      })
      .expect(201);

    await createAndPublishPage('sitemap-pubblicata', [], 'Pubblicata');

    const res = await request(app.getHttpServer())
      .get('/public/pages')
      .query({ domain })
      .expect(200);

    const slugs = res.body.items.map((item: { slug: string }) => item.slug);
    expect(slugs).toContain('sitemap-pubblicata');
    expect(slugs).not.toContain('sitemap-bozza');
    expect(res.body.searchEngineIndexingEnabled).toBe(false);
  });

  it('returns an empty, indexing-allowed list for a domain that matches no site', async () => {
    const res = await request(app.getHttpServer())
      .get('/public/pages')
      .query({ domain: 'nobody-owns-this-domain.test' })
      .expect(200);

    expect(res.body).toEqual({
      items: [],
      searchEngineIndexingEnabled: true,
      defaultLocale: 'it',
    });
  });

  /*
   * It gives the suite's one person a name and an address: no other test
   * here reads a byline, so none of them depends on it being empty.
   */
  describe('an author page', () => {
    it('serves the person and what they wrote — never their email — and says where a left address went', async () => {
      const collectionRes = await agent
        .post('/collections')
        .send({ siteId, name: 'News' })
        .expect(201);
      const groupRes = await agent
        .post('/page-groups')
        .send({
          siteId,
          collectionId: collectionRes.body.id,
          content: [{ type: 'AuthorBox', props: {} }],
        })
        .expect(201);
      const translationRes = await agent
        .post(`/page-groups/${groupRes.body.id}/translations`)
        .send({
          locale: 'it',
          slug: 'articolo-firmato',
          seoMeta: { title: 'Articolo firmato', description: '' },
        })
        .expect(201);
      await agent
        .post(`/page-groups/translations/${translationRes.body.id}/publish`)
        .expect(201);
      const slug = `autrice-${randomUUID().slice(0, 8)}`;
      await agent
        .patch('/account/profile')
        .send({
          displayName: 'Autrice Prova',
          slug,
          bio: { it: 'Scrive di prove.' },
        })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/public/pages/author-by-slug')
        .query({ domain, locale: 'it', slug })
        .expect(200);

      expect(res.body.author).toEqual({
        id: userId,
        name: 'Autrice Prova',
        bio: 'Scrive di prove.',
        avatar: null,
        path: `/it/autore/${slug}`,
      });
      expect(res.body.content[0].type).toBe('AuthorBox');
      expect(res.body.content[0].props.isProfilePage).toBe(true);
      expect(
        res.body.content[1].props.items.map(
          (item: { title: string }) => item.title,
        ),
      ).toEqual(['Articolo firmato']);
      expect(JSON.stringify(res.body)).not.toContain('public-integration-');
      expect(JSON.stringify(res.body)).not.toContain('"role"');

      // The article's own box is filled with the same person.
      const article = await request(app.getHttpServer())
        .get('/public/pages/by-slug')
        .query({ domain, locale: 'it', path: 'articolo-firmato' })
        .expect(200);
      expect(article.body.content[0].props.author.path).toBe(
        `/it/autore/${slug}`,
      );

      // Listed for search engines, at the same address.
      const sitemap = await request(app.getHttpServer())
        .get('/public/pages')
        .query({ domain })
        .expect(200);
      expect(sitemap.body.items).toContainEqual(
        expect.objectContaining({
          groupId: `author:${userId}`,
          slug,
          ancestorSlugs: ['autore'],
        }),
      );

      // A language the site does not publish has no author page.
      await request(app.getHttpServer())
        .get('/public/pages/author-by-slug')
        .query({ domain, locale: 'en', slug })
        .expect(404);

      await agent
        .patch('/account/profile')
        .send({ displayName: 'Autrice Prova', slug: `${slug}-nuova`, bio: {} })
        .expect(200);
      const moved = await request(app.getHttpServer())
        .get('/public/pages/author-by-slug')
        .query({ domain, locale: 'it', slug })
        .expect(404);
      expect(moved.body.movedTo).toBe(`/it/autore/${slug}-nuova`);
    });
  });

  describe('preview', () => {
    it('serves the real draft, unpublished, behind a valid preview token — without a session', async () => {
      const groupRes = await agent
        .post('/page-groups')
        .send({
          siteId,
          content: [{ type: 'Hero', props: { title: 'Bozza' } }],
        })
        .expect(201);
      const translationRes = await agent
        .post(`/page-groups/${groupRes.body.id}/translations`)
        .send({
          locale: 'it',
          slug: `preview-${randomUUID()}`,
          seoMeta: { title: 'In lavorazione', description: '...' },
        })
        .expect(201);
      const translationId = translationRes.body.id;
      // Deliberately never published.
      const tokenRes = await agent
        .post(`/page-groups/translations/${translationId}/preview-token`)
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/public/pages/${translationId}/preview`)
        .query({ token: tokenRes.body.token })
        .expect(200);

      expect(res.body.content).toEqual([
        { type: 'Hero', props: { title: 'Bozza' } },
      ]);
    });

    it('404s a preview request with a wrong/mismatched token', async () => {
      const groupRes = await agent
        .post('/page-groups')
        .send({ siteId, content: [] })
        .expect(201);
      const translationRes = await agent
        .post(`/page-groups/${groupRes.body.id}/translations`)
        .send({
          locale: 'it',
          slug: `preview-${randomUUID()}`,
          seoMeta: { title: 'In lavorazione', description: '...' },
        })
        .expect(201);

      await request(app.getHttpServer())
        .get(`/public/pages/${translationRes.body.id}/preview`)
        .query({ token: 'not-a-real-token' })
        .expect(404);
    });

    it('404s a preview request whose token belongs to a different page', async () => {
      const groupRes = await agent
        .post('/page-groups')
        .send({ siteId, content: [] })
        .expect(201);
      const first = await agent
        .post(`/page-groups/${groupRes.body.id}/translations`)
        .send({
          locale: 'it',
          slug: `preview-${randomUUID()}`,
          seoMeta: { title: 'Prima', description: '...' },
        })
        .expect(201);
      // Another page, in the one language this suite's site offers.
      const secondGroupRes = await agent
        .post('/page-groups')
        .send({ siteId, content: [] })
        .expect(201);
      const second = await agent
        .post(`/page-groups/${secondGroupRes.body.id}/translations`)
        .send({
          locale: 'it',
          slug: `preview-${randomUUID()}`,
          seoMeta: { title: 'Seconda', description: '...' },
        })
        .expect(201);
      const tokenForFirst = await agent
        .post(`/page-groups/translations/${first.body.id}/preview-token`)
        .expect(201);

      await request(app.getHttpServer())
        .get(`/public/pages/${second.body.id}/preview`)
        .query({ token: tokenForFirst.body.token })
        .expect(404);
    });
  });
});

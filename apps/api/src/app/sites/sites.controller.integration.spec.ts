import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { formSubmissions, withTenant } from '@kometio/postgres-db';
import { SitesModule } from './sites.module';
import { IntegrationApp } from '../../test/integration-app.test-fixture';

/**
 * Runs against a real Postgres, through the real HTTP stack — same
 * throwaway-site-under-DEFAULT_TENANT_ID isolation as
 * pages.controller.integration.spec.ts, and the same reasoning for it: a
 * shared dev-seed site would accumulate business-info edits across runs.
 */
describe('SitesController (integration)', () => {
  let integration: IntegrationApp;
  let app: INestApplication;
  let agent: ReturnType<typeof request.agent>;
  let siteId: string;
  let editorAgent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    integration = await IntegrationApp.start({ imports: [SitesModule] });
    app = integration.app;
    siteId = await integration.createSite();
    agent = await integration.login(await integration.createUser());

    // Second user with the lowest role, to prove RolesGuard/@Roles('admin')
    // actually blocks theme-settings for it (security review 2026-08-25 —
    // this endpoint injects headScript/bodyScript/customCss unsanitized
    // into every public visitor's page, so a non-admin writing to it is a
    // site-wide XSS).
    editorAgent = await integration.login(
      await integration.createUser({ role: 'editor' }),
    );
  });

  afterAll(async () => {
    await integration.close();
  });

  describe('how many answers a retention would delete', () => {
    async function answerFrom(daysAgo: number) {
      await withTenant(integration.db, integration.tenantId, (tx) =>
        tx.insert(formSubmissions).values({
          tenantId: integration.tenantId,
          siteId,
          formId: null,
          pageId: null,
          payload: {},
          createdAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
        }),
      );
    }

    it('counts the site’s answers older than the number of days', async () => {
      await answerFrom(3);
      await answerFrom(40);
      await answerFrom(500);

      const short = await agent
        .get(`/sites/${siteId}/form-submissions/count`)
        .query({ olderThanDays: 30 })
        .expect(200);
      const long = await agent
        .get(`/sites/${siteId}/form-submissions/count`)
        .query({ olderThanDays: 365 })
        .expect(200);

      expect(short.body).toEqual({ count: 2 });
      expect(long.body).toEqual({ count: 1 });
    });

    it('400s a number of days that is not a whole number of at least one', async () => {
      for (const olderThanDays of ['0', '-5', '2.5', 'many', '99999999']) {
        await agent
          .get(`/sites/${siteId}/form-submissions/count`)
          .query({ olderThanDays })
          .expect(400);
      }
      await agent.get(`/sites/${siteId}/form-submissions/count`).expect(400);
    });

    it('404s a site that does not exist', async () => {
      await agent
        .get(`/sites/${randomUUID()}/form-submissions/count`)
        .query({ olderThanDays: 30 })
        .expect(404);
    });

    it('403s an editor: what a retention would delete is for whoever may set it', async () => {
      await editorAgent
        .get(`/sites/${siteId}/form-submissions/count`)
        .query({ olderThanDays: 30 })
        .expect(403);
    });
  });

  it('finds a site by id, with no business info yet', async () => {
    const res = await agent.get(`/sites/${siteId}`).expect(200);

    expect(res.body.businessAddress).toBeNull();
    expect(res.body.openingHours).toBeNull();
  });

  it('404s finding a site that does not exist', async () => {
    await agent.get(`/sites/${randomUUID()}`).expect(404);
  });

  it('updates business info, including multi-range opening hours', async () => {
    const res = await agent
      .patch(`/sites/${siteId}/business-info`)
      .send({
        businessAddress: {
          street: 'Via Roma 1',
          postalCode: '20121',
          city: 'Milano',
          country: 'IT',
        },
        businessPhone: '+39 02 1234567',
        businessEmail: null,
        businessType: 'Restaurant',
        openingHours: [
          {
            dayOfWeek: 'monday',
            ranges: [
              { opens: '12:00', closes: '14:30' },
              { opens: '19:00', closes: '23:00' },
            ],
          },
          { dayOfWeek: 'sunday', ranges: [] },
        ],
      })
      .expect(200);

    expect(res.body.businessAddress).toEqual({
      street: 'Via Roma 1',
      postalCode: '20121',
      city: 'Milano',
      country: 'IT',
    });
    expect(res.body.openingHours).toHaveLength(2);

    const getRes = await agent.get(`/sites/${siteId}`).expect(200);
    expect(getRes.body.businessPhone).toBe('+39 02 1234567');
  });

  it('stores the email trimmed, and refuses one that is not an address', async () => {
    const base = {
      businessAddress: null,
      businessPhone: null,
      businessType: null,
      openingHours: null,
    };
    const saved = await agent
      .patch(`/sites/${siteId}/business-info`)
      .send({ ...base, businessEmail: '  ciao@example.com ' })
      .expect(200);
    expect(saved.body.businessEmail).toBe('ciao@example.com');

    await agent
      .patch(`/sites/${siteId}/business-info`)
      .send({ ...base, businessEmail: 'non-una-email' })
      .expect(400);
    // The refused update changed nothing.
    const after = await agent.get(`/sites/${siteId}`).expect(200);
    expect(after.body.businessEmail).toBe('ciao@example.com');
  });

  it('400s an opening hours entry not in HH:MM format', async () => {
    await agent
      .patch(`/sites/${siteId}/business-info`)
      .send({
        businessAddress: null,
        businessPhone: null,
        businessEmail: null,
        businessType: null,
        openingHours: [
          { dayOfWeek: 'monday', ranges: [{ opens: '9am', closes: '13:00' }] },
        ],
      })
      .expect(400);
  });

  it('404s updating business info for a site that does not exist', async () => {
    await agent
      .patch(`/sites/${randomUUID()}/business-info`)
      .send({
        businessAddress: null,
        businessPhone: null,
        businessEmail: null,
        businessType: null,
        openingHours: null,
      })
      .expect(404);
  });

  it('updates general settings (name and domain)', async () => {
    // Randomized, not a literal: sites has UNIQUE(tenant_id, domain) (security
    // review 2026-08-24, point 8) and this test runs under the shared
    // DEFAULT_TENANT_ID — a literal domain here would permanently collide
    // with itself if a prior run of this exact test was ever killed before
    // its own afterAll cleanup ran (verified: this happened once already,
    // from an unrelated OOM kill mid-suite, and blocked every subsequent
    // run until the orphaned row was deleted by hand).
    const domain = `ilmioristorante-${randomUUID()}.it`;
    const res = await agent
      .patch(`/sites/${siteId}/general-settings`)
      .send({ name: 'Il mio ristorante', domain })
      .expect(200);

    expect(res.body.name).toBe('Il mio ristorante');
    expect(res.body.domain).toBe(domain);

    const getRes = await agent.get(`/sites/${siteId}`).expect(200);
    expect(getRes.body.domain).toBe(domain);
  });

  it('400s a domain that is not a valid hostname', async () => {
    await agent
      .patch(`/sites/${siteId}/general-settings`)
      .send({ name: 'x', domain: 'not a valid host!!' })
      .expect(400);
  });

  it('404s updating general settings for a site that does not exist', async () => {
    await agent
      .patch(`/sites/${randomUUID()}/general-settings`)
      .send({ name: 'x', domain: null })
      .expect(404);
  });

  it('defaults search engine indexing to disabled, and can be enabled', async () => {
    const getRes = await agent.get(`/sites/${siteId}`).expect(200);
    expect(getRes.body.searchEngineIndexingEnabled).toBe(false);

    const res = await agent
      .patch(`/sites/${siteId}/seo-settings`)
      .send({ searchEngineIndexingEnabled: true })
      .expect(200);

    expect(res.body.searchEngineIndexingEnabled).toBe(true);
  });

  it('404s updating SEO settings for a site that does not exist', async () => {
    await agent
      .patch(`/sites/${randomUUID()}/seo-settings`)
      .send({ searchEngineIndexingEnabled: true })
      .expect(404);
  });

  it('updates theme settings, persisted across the real HTTP+DB stack', async () => {
    const res = await agent
      .patch(`/sites/${siteId}/theme-settings`)
      .send({
        primaryColor: '#18181b',
        secondaryColor: '#71717a',
        fontFamily: 'inter',
        customCss: '.kometio-hero { text-transform: uppercase; }',
        contentWidth: null,
        headScript: null,
        bodyScript: null,
        faviconUrl: 'https://example.com/favicon.png',
        overridesEnabled: true,
        allowedTrackerDomains: [],
        trackerScripts: [],
      })
      .expect(200);

    expect(res.body.themePrimaryColor).toBe('#18181b');
    expect(res.body.themeFontFamily).toBe('inter');

    const getRes = await agent.get(`/sites/${siteId}`).expect(200);
    expect(getRes.body.themeSecondaryColor).toBe('#71717a');
    expect(getRes.body.themeCustomCss).toBe(
      '.kometio-hero { text-transform: uppercase; }',
    );
    expect(getRes.body.themeFaviconUrl).toBe('https://example.com/favicon.png');
  });

  it('defaults theme overrides to enabled, and can be turned off (docs/adr/0021 two-gate composition)', async () => {
    const getRes = await agent.get(`/sites/${siteId}`).expect(200);
    expect(getRes.body.themeOverridesEnabled).toBe(true);

    const res = await agent
      .patch(`/sites/${siteId}/theme-settings`)
      .send({
        primaryColor: null,
        secondaryColor: null,
        fontFamily: null,
        customCss: null,
        contentWidth: null,
        headScript: null,
        bodyScript: null,
        faviconUrl: null,
        overridesEnabled: false,
        allowedTrackerDomains: [],
        trackerScripts: [],
      })
      .expect(200);

    expect(res.body.themeOverridesEnabled).toBe(false);
  });

  it('400s an invalid hex color for theme settings', async () => {
    await agent
      .patch(`/sites/${siteId}/theme-settings`)
      .send({
        primaryColor: 'not-a-hex-color',
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
      })
      .expect(400);
  });

  it('400s a content width that is not a CSS length, and saves one that is', async () => {
    const body = {
      primaryColor: null,
      secondaryColor: null,
      fontFamily: null,
      customCss: null,
      headScript: null,
      bodyScript: null,
      faviconUrl: null,
      overridesEnabled: true,
      allowedTrackerDomains: [],
      trackerScripts: [],
    };

    // "banana" used to be accepted: written into the stylesheet it is a rule
    // the browser drops without a word, so the setting looked saved and did
    // nothing.
    for (const contentWidth of ['banana', '64', 'wide', '']) {
      await agent
        .patch(`/sites/${siteId}/theme-settings`)
        .send({ ...body, contentWidth })
        .expect(400);
    }

    for (const contentWidth of ['64rem', '1100px', '80%', 'min(90vw, 70rem)']) {
      const res = await agent
        .patch(`/sites/${siteId}/theme-settings`)
        .send({ ...body, contentWidth })
        .expect(200);
      expect(res.body.themeContentWidth).toBe(contentWidth);
    }
  });

  it('404s updating theme settings for a site that does not exist', async () => {
    await agent
      .patch(`/sites/${randomUUID()}/theme-settings`)
      .send({
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
      })
      .expect(404);
  });

  it("403s updating theme settings for a non-admin role (an 'editor' can't inject scripts served to every public visitor)", async () => {
    await editorAgent
      .patch(`/sites/${siteId}/theme-settings`)
      .send({
        primaryColor: null,
        secondaryColor: null,
        fontFamily: null,
        customCss: null,
        contentWidth: null,
        headScript: '<script>alert(1)</script>',
        bodyScript: null,
        faviconUrl: null,
        overridesEnabled: true,
        allowedTrackerDomains: [],
        trackerScripts: [],
      })
      .expect(403);
  });

  it('defaults theme tokens to an empty blockStyles map, and updates the override for one block type', async () => {
    const getRes = await agent.get(`/sites/${siteId}`).expect(200);
    expect(getRes.body.themeTokens).toEqual({ blockStyles: {} });

    const res = await agent
      .patch(`/sites/${siteId}/theme-tokens`)
      .send({
        blockType: 'Button',
        // Sent flat, on purpose: the shape a client written before
        // ADR-0047 sends, and `responsiveBlockStyleSchema` reads it as the
        // base size rather than rejecting it.
        style: { borderRadius: '9999px', paddingX: '1.5rem' },
      })
      .expect(200);

    // Keyed by variant since ADR-0047, and `default` is what a body with
    // no `variant` means — the shape every client sent before it.
    expect(res.body.themeTokens).toEqual({
      blockStyles: {
        Button: {
          default: { base: { borderRadius: '9999px', paddingX: '1.5rem' } },
        },
      },
    });

    const getAfter = await agent.get(`/sites/${siteId}`).expect(200);
    expect(getAfter.body.themeTokens).toEqual({
      blockStyles: {
        Button: {
          default: { base: { borderRadius: '9999px', paddingX: '1.5rem' } },
        },
      },
    });
  });

  it('404s updating theme tokens for a site that does not exist', async () => {
    await agent
      .patch(`/sites/${randomUUID()}/theme-tokens`)
      .send({
        blockType: 'Button',
        style: { borderRadius: '6px' },
      })
      .expect(404);
  });

  it('401s without a session cookie', async () => {
    await request(app.getHttpServer()).get(`/sites/${siteId}`).expect(401);
  });
});

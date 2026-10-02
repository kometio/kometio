import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PagesModule } from '../pages/pages.module';
import { TaxonomiesModule } from './taxonomies.module';
import { IntegrationApp } from '../../test/integration-app.test-fixture';

/**
 * Runs against a real Postgres, through the real HTTP stack — the same
 * discipline as the page-groups spec next door. Both modules are loaded
 * because the rule under test spans them: a term cannot land on a page's
 * address and a page cannot land on a term's, and the two halves are
 * enforced in different controllers (docs/adr/0064).
 */
describe('TaxonomiesController (integration)', () => {
  let integration: IntegrationApp;
  let app: INestApplication;
  let agent: ReturnType<typeof request.agent>;
  let siteId: string;

  beforeAll(async () => {
    integration = await IntegrationApp.start({
      imports: [TaxonomiesModule, PagesModule],
    });
    app = integration.app;
    siteId = await integration.createSite({
      defaultLocale: 'en',
      enabledLocales: ['en', 'it'],
    });
    agent = await integration.login(await integration.createUser());
  });

  afterAll(async () => {
    await integration.close();
  });

  /** Not `async`: the caller chains `.expect()` on it, which is supertest's own, not a promise's. */
  function createTaxonomy(body: Record<string, unknown>) {
    return agent.post('/taxonomies').send({ siteId, ...body });
  }

  it('runs the whole cycle over HTTP: dimension, term, re-file, page assignment', async () => {
    const suffix = randomUUID().slice(0, 8);
    const created = await createTaxonomy({
      name: { en: `Category ${suffix}`, it: `Categoria ${suffix}` },
      prefix: `category-${suffix}`,
    }).expect(201);
    const taxonomyId = created.body.id;
    expect(created.body.prefix).toBe(`category-${suffix}`);
    expect(created.body.hierarchical).toBe(true);

    const parent = await agent
      .post(`/taxonomies/${taxonomyId}/terms`)
      .send({ name: { en: `Machines ${suffix}` } })
      .expect(201);
    expect(parent.body.slugs).toEqual({ en: `machines-${suffix}` });

    const child = await agent
      .post(`/taxonomies/${taxonomyId}/terms`)
      .send({
        name: { en: `Automatic ${suffix}` },
        parentId: parent.body.id,
      })
      .expect(201);
    expect(child.body.parentId).toBe(parent.body.id);

    const listed = await agent
      .get(`/taxonomies/${taxonomyId}/terms`)
      .expect(200);
    expect(listed.body).toHaveLength(2);

    // Re-filing keeps the address: it never contained the ancestors.
    const moved = await agent
      .patch(`/taxonomies/terms/${child.body.id}/parent`)
      .send({ parentId: null })
      .expect(200);
    expect(moved.body.parentId).toBeNull();
    expect(moved.body.slugs).toEqual({ en: `automatic-${suffix}` });

    const group = await agent.post('/page-groups').send({ siteId }).expect(201);
    const assigned = await agent
      .patch(`/page-groups/${group.body.id}/terms`)
      .send({ termIds: [parent.body.id, child.body.id] })
      .expect(200);
    expect(assigned.body.termIds).toHaveLength(2);

    const readBack = await agent
      .get(`/page-groups/${group.body.id}/terms`)
      .expect(200);
    expect(readBack.body.termIds).toHaveLength(2);
  });

  /*
   * The switch that keeps a thin term out of search engines: it has to
   * survive the round trip, because the public site reads it from here
   * to decide what the page says about itself.
   */
  it('remembers a term asked to stay out of search engines', async () => {
    const suffix = randomUUID().slice(0, 8);
    const taxonomy = await createTaxonomy({
      name: { en: `Indexing ${suffix}` },
      prefix: `indexing-${suffix}`,
    }).expect(201);
    const term = await agent
      .post(`/taxonomies/${taxonomy.body.id}/terms`)
      .send({ name: { en: `Thin ${suffix}` } })
      .expect(201);
    expect(term.body.noindex).toBe(false);

    const updated = await agent
      .patch(`/taxonomies/terms/${term.body.id}`)
      .send({ noindex: true })
      .expect(200);
    expect(updated.body.noindex).toBe(true);

    const listed = await agent
      .get(`/taxonomies/${taxonomy.body.id}/terms`)
      .expect(200);
    expect(
      listed.body.find((one: { id: string }) => one.id === term.body.id)
        ?.noindex,
    ).toBe(true);
  });

  it('answers 409 when a dimension asks for a prefix that is taken', async () => {
    const prefix = `family-${randomUUID().slice(0, 8)}`;
    await createTaxonomy({ name: { en: 'Family' }, prefix }).expect(201);

    await createTaxonomy({ name: { en: 'Family again' }, prefix }).expect(409);
  });

  /*
   * The two halves of the rule no database constraint can hold, over
   * HTTP: a root-mounted term and a root page competing for one address,
   * from both directions.
   */
  it('answers 409 in both directions when a term and a page want one address', async () => {
    const suffix = randomUUID().slice(0, 8);
    const rootMounted = await createTaxonomy({
      name: { en: `Loose ${suffix}` },
      prefix: null,
    }).expect(201);

    await agent
      .post(`/taxonomies/${rootMounted.body.id}/terms`)
      .send({ name: { en: `Espresso ${suffix}` } })
      .expect(201);

    const group = await agent.post('/page-groups').send({ siteId }).expect(201);
    const pageOnTerm = await agent
      .post(`/page-groups/${group.body.id}/translations`)
      .send({
        locale: 'en',
        slug: `espresso-${suffix}`,
        seoMeta: { title: 'Espresso', description: '' },
      });
    expect(pageOnTerm.status).toBe(409);

    // ...and the other way round: a page first, then a term asking for
    // the address it already answers.
    const otherGroup = await agent
      .post('/page-groups')
      .send({ siteId })
      .expect(201);
    const pageSlug = `contact-${suffix}`;
    await agent
      .post(`/page-groups/${otherGroup.body.id}/translations`)
      .send({
        locale: 'en',
        slug: pageSlug,
        seoMeta: { title: 'Contact', description: '' },
      })
      .expect(201);

    const termOnPage = await agent
      .post(`/taxonomies/${rootMounted.body.id}/terms`)
      .send({ name: { en: 'Contact' }, slugs: { en: pageSlug } });
    expect(termOnPage.status).toBe(409);
  });

  it('answers 400 when a term is asked to descend from itself', async () => {
    const suffix = randomUUID().slice(0, 8);
    const taxonomy = await createTaxonomy({
      name: { en: `Cycle ${suffix}` },
      prefix: `cycle-${suffix}`,
    }).expect(201);
    const parent = await agent
      .post(`/taxonomies/${taxonomy.body.id}/terms`)
      .send({ name: { en: `Parent ${suffix}` } })
      .expect(201);
    const child = await agent
      .post(`/taxonomies/${taxonomy.body.id}/terms`)
      .send({ name: { en: `Child ${suffix}` }, parentId: parent.body.id })
      .expect(201);

    await agent
      .patch(`/taxonomies/terms/${parent.body.id}/parent`)
      .send({ parentId: child.body.id })
      .expect(400);
  });

  it('moves every term when the dimension prefix changes', async () => {
    const suffix = randomUUID().slice(0, 8);
    const taxonomy = await createTaxonomy({
      name: { en: `Movable ${suffix}` },
      prefix: `before-${suffix}`,
    }).expect(201);
    await agent
      .post(`/taxonomies/${taxonomy.body.id}/terms`)
      .send({ name: { en: `Thing ${suffix}` } })
      .expect(201);

    const updated = await agent
      .patch(`/taxonomies/${taxonomy.body.id}`)
      .send({ prefix: `after-${suffix}` })
      .expect(200);

    expect(updated.body.prefix).toBe(`after-${suffix}`);
    // The term is still there and still answers — under the new prefix.
    const terms = await agent
      .get(`/taxonomies/${taxonomy.body.id}/terms`)
      .expect(200);
    expect(terms.body[0].slugs).toEqual({ en: `thing-${suffix}` });
  });

  it('requires a session', async () => {
    await request(app.getHttpServer())
      .get(`/taxonomies?siteId=${siteId}`)
      .expect(401);
  });

  describe('putting the terms of a dimension in an order', () => {
    async function dimensionWithTerms(names: string[]) {
      const suffix = randomUUID().slice(0, 8);
      const taxonomy = await createTaxonomy({
        name: { en: `Order ${suffix}` },
        prefix: `order-${suffix}`,
      }).expect(201);
      const terms: { id: string; name: string }[] = [];
      for (const name of names) {
        const made = await agent
          .post(`/taxonomies/${taxonomy.body.id}/terms`)
          .send({ name: { en: `${name} ${suffix}` } })
          .expect(201);
        terms.push({ id: made.body.id as string, name: `${name} ${suffix}` });
      }
      return { taxonomyId: taxonomy.body.id as string, terms, suffix };
    }
    const listedNames = async (taxonomyId: string) =>
      (
        (await agent.get(`/taxonomies/${taxonomyId}/terms`).expect(200))
          .body as { name: { en: string } }[]
      ).map((term) => term.name.en);

    it('reads terms in the order they were made', async () => {
      const { taxonomyId, terms } = await dimensionWithTerms(['A', 'B', 'C']);

      expect(await listedNames(taxonomyId)).toEqual(terms.map((t) => t.name));
    });

    it('puts the siblings in the order given, and answers with the list as it now reads', async () => {
      const { taxonomyId, terms } = await dimensionWithTerms(['A', 'B', 'C']);
      const [a, b, c] = terms;
      if (!a || !b || !c) throw new Error('terms were not made');

      const res = await agent
        .patch(`/taxonomies/${taxonomyId}/terms/reorder`)
        .send({ parentId: null, orderedTermIds: [c.id, a.id, b.id] })
        .expect(200);

      expect(res.body.map((t: { name: { en: string } }) => t.name.en)).toEqual([
        c.name,
        a.name,
        b.name,
      ]);
      expect(await listedNames(taxonomyId)).toEqual([c.name, a.name, b.name]);
    });

    it('keeps a term made afterwards at the end', async () => {
      const { taxonomyId, terms, suffix } = await dimensionWithTerms([
        'A',
        'B',
      ]);
      const [a, b] = terms;
      if (!a || !b) throw new Error('terms were not made');
      await agent
        .patch(`/taxonomies/${taxonomyId}/terms/reorder`)
        .send({ parentId: null, orderedTermIds: [b.id, a.id] })
        .expect(200);

      await agent
        .post(`/taxonomies/${taxonomyId}/terms`)
        .send({ name: { en: `D ${suffix}` } })
        .expect(201);

      expect(await listedNames(taxonomyId)).toEqual([
        b.name,
        a.name,
        `D ${suffix}`,
      ]);
    });

    it('400s a list that is not exactly the siblings, changing nothing', async () => {
      const { taxonomyId, terms } = await dimensionWithTerms(['A', 'B', 'C']);
      const [a, b, c] = terms;
      if (!a || !b || !c) throw new Error('terms were not made');

      await agent
        .patch(`/taxonomies/${taxonomyId}/terms/reorder`)
        .send({ parentId: null, orderedTermIds: [c.id, a.id] })
        .expect(400);
      await agent
        .patch(`/taxonomies/${taxonomyId}/terms/reorder`)
        .send({ parentId: null, orderedTermIds: [] })
        .expect(400);
      await agent
        .patch(`/taxonomies/${taxonomyId}/terms/reorder`)
        .send({ parentId: null, orderedTermIds: ['not-a-uuid'] })
        .expect(400);

      expect(await listedNames(taxonomyId)).toEqual([a.name, b.name, c.name]);
    });

    it('404s a dimension that does not exist', async () => {
      await agent
        .patch(`/taxonomies/${randomUUID()}/terms/reorder`)
        .send({ parentId: null, orderedTermIds: [randomUUID()] })
        .expect(404);
    });
  });
});

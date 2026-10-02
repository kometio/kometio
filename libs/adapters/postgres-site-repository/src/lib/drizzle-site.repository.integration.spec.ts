import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type KometioDb,
  createAppDb,
  sites,
  withTenant,
} from '@kometio/postgres-db';
import {
  createIntegrationSite,
  createIntegrationTenant,
  deleteIntegrationTenants,
} from '@kometio/postgres-db/testing';
import { DrizzleSiteRepository } from './drizzle-site.repository';

/**
 * Runs against a real Postgres — see docs/development.md. Connects as
 * `kometio_app`, same as production code, so this is also the RLS regression
 * test for `sites`: domain lookup is the one query the public site's
 * unauthenticated rendering path relies on, so a tenant leak here would be
 * a real cross-site data exposure, not just a test failure.
 */
describe('DrizzleSiteRepository (integration)', () => {
  let db: KometioDb;
  let siteRepository: DrizzleSiteRepository;
  let tenantAId: string;
  let tenantBId: string;

  beforeAll(async () => {
    db = createAppDb();
    siteRepository = new DrizzleSiteRepository(db);

    tenantAId = await createIntegrationTenant(db, 'Integration Tenant A');
    tenantBId = await createIntegrationTenant(db, 'Integration Tenant B');
  });

  afterAll(async () => {
    await deleteIntegrationTenants(db, [tenantAId, tenantBId]);
    await db.$client.end();
  });

  it('finds a site by domain, scoped to its tenant', async () => {
    const domain = `site-${randomUUID()}.example.com`;
    await createIntegrationSite(db, tenantAId, { name: 'Site A', domain });

    const found = await siteRepository.findByDomain(tenantAId, domain);
    expect(found?.name).toBe('Site A');
    expect(found?.domain).toBe(domain);

    const foundFromOtherTenant = await siteRepository.findByDomain(
      tenantBId,
      domain,
    );
    expect(foundFromOtherTenant).toBeNull();
  });

  it('returns null for a domain that does not exist', async () => {
    expect(
      await siteRepository.findByDomain(tenantAId, 'nobody-has-this.test'),
    ).toBeNull();
  });

  it('finds a site by id, scoped to its tenant', async () => {
    const siteId = await createIntegrationSite(db, tenantAId, {
      name: 'Site by id',
    });

    const found = await siteRepository.findById(tenantAId, siteId);
    expect(found?.name).toBe('Site by id');

    expect(await siteRepository.findById(tenantBId, siteId)).toBeNull();
  });

  it('save() persists business info and upserts on a second call', async () => {
    const siteId = await createIntegrationSite(db, tenantAId);

    const site = await siteRepository.findById(tenantAId, siteId);
    if (!site) throw new Error('expected the just-inserted site to be found');
    site.updateBusinessInfo({
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
          ranges: [{ opens: '12:00', closes: '15:00' }],
        },
      ],
    });
    await siteRepository.save(site);

    const updated = await siteRepository.findById(tenantAId, siteId);
    // Round-tripped through jsonb since docs/adr/0081, parts and all.
    expect(updated?.businessAddress).toEqual({
      street: 'Via Roma 1',
      postalCode: '20121',
      city: 'Milano',
      country: 'IT',
    });
    expect(updated?.openingHours).toEqual([
      { dayOfWeek: 'monday', ranges: [{ opens: '12:00', closes: '15:00' }] },
    ]);
  });

  // Regression for the UNIQUE(tenant_id, domain) constraint (migration
  // 0027): before it, findByDomain's `.limit(1)` with no ORDER BY made
  // which site got served indeterminate whenever two sites of the same
  // tenant shared a domain — nothing prevented that at the DB level.
  it('rejects a second site with the same tenant and domain', async () => {
    const domain = `dup-${randomUUID()}.example.com`;
    await createIntegrationSite(db, tenantAId, { domain });

    await expect(
      withTenant(db, tenantAId, (tx) =>
        tx.insert(sites).values({
          tenantId: tenantAId,
          name: 'Second',
          domain,
          defaultLocale: 'it',
        }),
      ),
    ).rejects.toThrow();
  });

  // A site can go without a domain configured yet (e.g. still mid-setup) —
  // the constraint must not treat "no domain" as a value sites can collide
  // on. Postgres itself guarantees this (UNIQUE never matches NULL against
  // NULL), this just pins that behavior against a regression.
  it('allows multiple sites of the same tenant with no domain set', async () => {
    await withTenant(db, tenantAId, (tx) =>
      tx.insert(sites).values([
        { tenantId: tenantAId, name: 'No domain A', defaultLocale: 'it' },
        { tenantId: tenantAId, name: 'No domain B', defaultLocale: 'it' },
      ]),
    );
  });

  it('allows the same domain across different tenants', async () => {
    const domain = `shared-${randomUUID()}.example.com`;
    await withTenant(db, tenantAId, (tx) =>
      tx.insert(sites).values({
        tenantId: tenantAId,
        name: 'Tenant A site',
        domain,
        defaultLocale: 'it',
      }),
    );

    await withTenant(db, tenantBId, (tx) =>
      tx.insert(sites).values({
        tenantId: tenantBId,
        name: 'Tenant B site',
        domain,
        defaultLocale: 'it',
      }),
    );

    expect((await siteRepository.findByDomain(tenantAId, domain))?.name).toBe(
      'Tenant A site',
    );
    expect((await siteRepository.findByDomain(tenantBId, domain))?.name).toBe(
      'Tenant B site',
    );
  });
});

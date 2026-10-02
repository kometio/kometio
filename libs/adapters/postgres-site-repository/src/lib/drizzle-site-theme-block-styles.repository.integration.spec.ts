import { DEFAULT_VARIANT } from '@kometio/shared-types';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type KometioDb, createAppDb } from '@kometio/postgres-db';
import {
  createIntegrationSite,
  createIntegrationTenant,
  deleteIntegrationTenants,
} from '@kometio/postgres-db/testing';
import { DrizzleSiteThemeBlockStylesRepository } from './drizzle-site-theme-block-styles.repository';

/** Runs against a real Postgres — see docs/development.md. */
describe('DrizzleSiteThemeBlockStylesRepository (integration)', () => {
  let db: KometioDb;
  let repository: DrizzleSiteThemeBlockStylesRepository;
  let tenantAId: string;
  let siteId: string;

  beforeAll(async () => {
    db = createAppDb();
    repository = new DrizzleSiteThemeBlockStylesRepository(db);

    tenantAId = await createIntegrationTenant(db, 'Integration Tenant A');

    siteId = await createIntegrationSite(db, tenantAId);
  });

  afterAll(async () => {
    await deleteIntegrationTenants(db, [tenantAId]);
    await db.$client.end();
  });

  it('listBySite returns an empty map for a site with no customized block type', async () => {
    expect(await repository.listBySite(tenantAId, randomUUID())).toEqual({});
  });

  it('upsert then listBySite round-trips the style for a block type', async () => {
    await repository.upsert(tenantAId, siteId, 'Button', DEFAULT_VARIANT, {
      base: { borderRadius: '9999px' },
    });

    expect(await repository.listBySite(tenantAId, siteId)).toEqual({
      Button: { default: { base: { borderRadius: '9999px' } } },
    });
  });

  it('upsert on an already-styled type replaces that row, not a field-by-field merge', async () => {
    await repository.upsert(tenantAId, siteId, 'Banner', DEFAULT_VARIANT, {
      base: { borderRadius: '6px', paddingX: '1rem' },
    });

    await repository.upsert(tenantAId, siteId, 'Banner', DEFAULT_VARIANT, {
      base: { borderRadius: '9999px' },
    });

    const result = await repository.listBySite(tenantAId, siteId);
    expect(result['Banner']).toEqual({
      default: { base: { borderRadius: '9999px' } },
    });
  });

  /**
   * A block type name is any letter followed by letters and digits, which
   * includes `constructor` and `toString`. Collected into a plain object,
   * such a type resolved to the built-in of that name, and its variants
   * were written onto `Object` itself.
   */
  it('holds a type named like an Object member as an entry of its own', async () => {
    await repository.upsert(tenantAId, siteId, 'constructor', DEFAULT_VARIANT, {
      base: { borderRadius: '2px' },
    });

    const result = await repository.listBySite(tenantAId, siteId);

    expect(Object.hasOwn(result, 'constructor')).toBe(true);
    expect(result['constructor']).toEqual({
      default: { base: { borderRadius: '2px' } },
    });
    expect(Object.hasOwn(Object, DEFAULT_VARIANT)).toBe(false);
  });

  /**
   * The reason the primary key gained a third column (ADR-0047): an
   * agency recolours the ghost buttons without touching the primary ones.
   * With the old two-column key the second upsert would have replaced the
   * first, and the two looks could never differ.
   */
  it('keeps two variants of the same type as separate rows', async () => {
    await repository.upsert(tenantAId, siteId, 'Button', DEFAULT_VARIANT, {
      base: { backgroundColor: '#0000ff' },
    });
    await repository.upsert(tenantAId, siteId, 'Button', 'ghost', {
      base: { backgroundColor: 'transparent' },
    });

    // On this type only: the spec shares one site across its cases, so
    // rows written by earlier ones are still there.
    const result = await repository.listBySite(tenantAId, siteId);
    expect(result['Button']).toEqual({
      default: { base: { backgroundColor: '#0000ff' } },
      ghost: { base: { backgroundColor: 'transparent' } },
    });
  });

  it('replaces one variant without disturbing its siblings', async () => {
    await repository.upsert(tenantAId, siteId, 'Button', DEFAULT_VARIANT, {
      base: { backgroundColor: '#0000ff' },
    });
    await repository.upsert(tenantAId, siteId, 'Button', 'ghost', {
      base: { backgroundColor: 'transparent' },
    });

    await repository.upsert(tenantAId, siteId, 'Button', 'ghost', {
      base: { backgroundColor: '#ff0000' },
    });

    const result = await repository.listBySite(tenantAId, siteId);
    expect(result['Button']).toEqual({
      default: { base: { backgroundColor: '#0000ff' } },
      ghost: { base: { backgroundColor: '#ff0000' } },
    });
  });

  it(
    'two concurrent upserts to DIFFERENT block types both survive (row-per-' +
      'type means no shared-row lost-update window)',
    async () => {
      await Promise.all([
        repository.upsert(tenantAId, siteId, 'Hero', DEFAULT_VARIANT, {
          base: { textColor: '#ffffff' },
        }),
        repository.upsert(tenantAId, siteId, 'Feature', DEFAULT_VARIANT, {
          base: { backgroundColor: '#000000' },
        }),
      ]);

      const result = await repository.listBySite(tenantAId, siteId);
      expect(result['Hero']).toEqual({
        default: { base: { textColor: '#ffffff' } },
      });
      expect(result['Feature']).toEqual({
        default: { base: { backgroundColor: '#000000' } },
      });
    },
  );
});

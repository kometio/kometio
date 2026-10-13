import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { type KometioDb, createAppDb, withTenant } from './client';
import { deleteIntegrationTenants } from './integration-test-cleanup';
import {
  createIntegrationTenant,
  createIntegrationUser,
} from './integration-test-fixtures';
import { users } from './schema';
import { StoredJsonInvalidError } from './validated-jsonb';

/**
 * Runs against a real Postgres (docs/development.md): the column's check on
 * the way out of a real table, through a query the repositories would make.
 */
describe('a validated jsonb column (integration)', () => {
  let db: KometioDb;
  let tenantId: string;
  const createdTenantIds: string[] = [];

  beforeAll(async () => {
    db = createAppDb();
    tenantId = await createIntegrationTenant(db, 'Stored JSON');
    createdTenantIds.push(tenantId);
  });

  afterAll(async () => {
    await deleteIntegrationTenants(db, createdTenantIds);
    await db.$client.end();
  });

  it('reads a row whose JSON is what the column says', async () => {
    const id = await createIntegrationUser(db, tenantId, {
      bio: { it: 'Ciao', en: 'Hello' },
    });

    const [row] = await withTenant(db, tenantId, (tx) =>
      tx.select({ bio: users.bio }).from(users).where(eq(users.id, id)),
    );

    expect(row?.bio).toEqual({ it: 'Ciao', en: 'Hello' });
  });

  it('refuses to read a row whose JSON is not, and only when that column is asked for', async () => {
    const id = await createIntegrationUser(db, tenantId);
    await withTenant(db, tenantId, (tx) =>
      tx.execute(
        sql`update users set bio = '["not","a","record"]'::jsonb where id = ${id}`,
      ),
    );

    await expect(
      withTenant(db, tenantId, (tx) =>
        tx.select().from(users).where(eq(users.id, id)),
      ),
    ).rejects.toThrow(StoredJsonInvalidError);

    // The same row, without the column: nothing is read that was not asked for.
    const [row] = await withTenant(db, tenantId, (tx) =>
      tx.select({ id: users.id }).from(users).where(eq(users.id, id)),
    );
    expect(row?.id).toBe(id);
  });

  it('refuses to write what the column would refuse to read', async () => {
    await expect(
      withTenant(db, tenantId, (tx) =>
        tx.insert(users).values({
          tenantId,
          email: 'stored-json@example.test',
          passwordHash: 'not-a-real-hash',
          role: 'admin',
          // From outside the type system, as a wrong value gets in: JSON.
          bio: JSON.parse('["not","a","record"]'),
        }),
      ),
    ).rejects.toThrow(/being written to "bio"/);
  });
});

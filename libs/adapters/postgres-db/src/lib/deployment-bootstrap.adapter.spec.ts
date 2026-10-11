import { describe, expect, it } from 'vitest';
import { DeploymentAlreadySetUpError } from '@kometio/domain-core';
import type { BootstrapDeploymentInput } from '@kometio/ports';
import type { KometioDb } from './client';
import { DrizzleDeploymentBootstrapAdapter } from './deployment-bootstrap.adapter';

/**
 * A transaction that only says what was asked of it, and in which order. What
 * is under test is the order (lock, look, then write), which a real database
 * shows only as a race between two requests; that is proved on the image, by
 * `docker/kometio/check.sh`, with three requests at once.
 *
 * The one cast: a stand-in for Drizzle's database, which has no interface a
 * test could implement short of the whole of it.
 */
function databaseThatHas(existingTenants: { id: string }[]) {
  const asked: string[] = [];
  const tx = {
    execute: async () => {
      asked.push('execute');
      return [];
    },
    select: () => ({
      from: () => ({
        limit: async () => {
          asked.push('look');
          return existingTenants;
        },
      }),
    }),
    insert: () => ({
      values: async () => {
        asked.push('insert');
      },
    }),
  };
  const db = {
    transaction: async <T>(work: (transaction: typeof tx) => Promise<T>) =>
      work(tx),
  } as unknown as KometioDb;
  return { db, asked };
}

const input: BootstrapDeploymentInput = {
  siteName: 'Bar Sport',
  defaultLocale: 'it',
  domain: null,
  adminEmail: 'admin@example.test',
  adminPasswordHash: 'hash',
  homePage: { locale: 'it', slug: 'home', title: 'Bar Sport', content: [] },
};

describe('DrizzleDeploymentBootstrapAdapter.bootstrap', () => {
  it('takes the lock and looks again before it writes anything', async () => {
    const { db, asked } = databaseThatHas([]);

    const created = await new DrizzleDeploymentBootstrapAdapter(db).bootstrap(
      input,
    );

    expect(asked.slice(0, 3)).toEqual(['execute', 'look', 'insert']);
    expect(created.tenantId).toEqual(expect.any(String));
  });

  it('refuses, and writes nothing, when a tenant is there by the time it holds the lock', async () => {
    const { db, asked } = databaseThatHas([{ id: 'the-first-one' }]);

    await expect(
      new DrizzleDeploymentBootstrapAdapter(db).bootstrap(input),
    ).rejects.toBeInstanceOf(DeploymentAlreadySetUpError);

    expect(asked).toEqual(['execute', 'look']);
  });
});

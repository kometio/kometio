import { describe, expect, it } from 'vitest';
import { createDb } from '@kometio/postgres-db';
import { SessionAuthAdapter } from './session-auth.adapter';

describe('SessionAuthAdapter password hashing', () => {
  // postgres.js connects lazily (see postgres-db's own client.spec.ts), so a
  // fake connection string is safe here — hashPassword/verifyPassword never
  // touch the db.
  const adapter = new SessionAuthAdapter(
    createDb('postgres://user:pass@localhost:5432/db'),
    async () => 'unused-in-this-suite',
  );

  it('hashes a password into an argon2id hash', async () => {
    const passwordHash = await adapter.hashPassword('correct-horse-battery');
    expect(passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('verifies a matching password', async () => {
    const passwordHash = await adapter.hashPassword('correct-horse-battery');
    expect(
      await adapter.verifyPassword('correct-horse-battery', passwordHash),
    ).toBe(true);
  });

  it('rejects a non-matching password', async () => {
    const passwordHash = await adapter.hashPassword('correct-horse-battery');
    expect(await adapter.verifyPassword('wrong-password', passwordHash)).toBe(
      false,
    );
  });
});

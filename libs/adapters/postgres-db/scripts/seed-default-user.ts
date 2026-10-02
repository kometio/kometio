/**
 * Creates a fixed admin user for local dev/testing — there is no public
 * registration endpoint (see docs/adr/0010-session-based-auth-foundations.md):
 * a self-hosted single-tenant CMS shouldn't let strangers self-signup. How
 * the real first admin gets created in production (setup wizard vs invite)
 * is a separate, later decision. Idempotent: safe to run on every dev
 * startup.
 */
import { hash } from '@node-rs/argon2';
import { requireEnv } from '@kometio/env-config';
import { createAppDb, withTenant } from '../src/lib/client';
import { users } from '../src/lib/schema';

async function main() {
  const tenantId = requireEnv('DEFAULT_TENANT_ID');
  const email = requireEnv('DEFAULT_USER_EMAIL');
  const password = requireEnv('DEFAULT_USER_PASSWORD');
  const db = createAppDb();

  const passwordHash = await hash(password);

  await withTenant(db, tenantId, (tx) =>
    tx
      .insert(users)
      .values({ tenantId, email, passwordHash, role: 'admin' })
      .onConflictDoNothing(),
  );

  console.log(`Seeded user ${email} for tenant ${tenantId}`);
  await db.$client.end();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

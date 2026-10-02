/**
 * A missing required credential/config value must fail loudly and
 * immediately, not silently fall back to a guessed default — see
 * libs/adapters/postgres-db/src/lib/client.ts for the original instance of
 * this pattern this library consolidates.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to ` +
        `.env and set it (see docs/development.md), or export it directly.`,
    );
  }
  return value;
}

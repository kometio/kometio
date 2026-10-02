// Vite equivalent of @kometio/env-config's requireEnv: that one reads
// process.env, which doesn't exist in this browser bundle — import.meta.env
// vars are inlined by Vite at build time instead. Same "fail loud, don't
// guess a default" rule (see libs/env-config/src/lib/require-env.ts).
export function requireViteEnv(name: string): string {
  const value = import.meta.env[name] as string | undefined;
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to ` +
        `.env and set it (see docs/development.md), or export it directly.`,
    );
  }
  return value;
}

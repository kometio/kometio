import { defineConfig } from 'drizzle-kit';
import { adminConnectionString } from './src/lib/client';

// Migrations always run as the Postgres admin/superuser (creating RLS
// policies and granting privileges to kometio_app requires table-owner rights)
// — never as kometio_app itself. See docs/adr/0002-non-superuser-role-for-rls-enforcement.md.
export default defineConfig({
  schema: './src/lib/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: adminConnectionString(),
  },
});

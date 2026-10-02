import { config } from 'dotenv';
import { resolve } from 'node:path';

// Loads local dev credentials for the integration tests, which talk to a
// real Postgres (see docs/development.md). CI sets these as job env vars
// instead, so this is a no-op there.
config({ path: resolve(__dirname, '../../.env') });

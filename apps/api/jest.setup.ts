import { config } from 'dotenv';
import { resolve } from 'node:path';

const repositoryRoot = resolve(__dirname, '../..');

// Loads local dev credentials for the integration tests, which talk to a
// real Postgres (see docs/development.md). CI sets these as job env vars
// instead, so this is a no-op there.
config({ path: resolve(repositoryRoot, '.env') });

// `.env` says `THEMES_DIR=./themes`, which is right for the API as `nx serve`
// starts it (from the workspace root) and wrong for Jest, which starts in
// this project's own directory: the catalog then listed a folder that is not
// there, and the one starter whose theme is not the site's own (the blog's)
// was a 500 on a developer's machine while CI, which sets an absolute path,
// passed. Anchored to the repository, whatever the working directory is.
process.env['THEMES_DIR'] = resolve(
  repositoryRoot,
  process.env['THEMES_DIR'] ?? 'themes',
);

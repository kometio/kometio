/**
 * Writes `apps/e2e/src/fixtures/block-samples.json`: one sample of every block
 * the page picker offers, with its default props — what the browser suite's
 * public-site accessibility audit puts on pages and visits.
 *
 *   pnpm run e2e:block-samples
 *
 * Generated and not written by hand, so that a block added tomorrow is audited
 * the day it is added; the registry's own spec (`block-samples.spec.ts`) fails,
 * naming this command, when the fixture has fallen behind. The browser suite
 * drives the apps from outside and may not import the registry
 * (eslint.config.mjs); a file is how it learns what blocks exist.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { blockSamples } from '../libs/block-registry/src/lib/block-samples';

const FIXTURE = join(
  import.meta.dirname,
  '../apps/e2e/src/fixtures/block-samples.json',
);

const samples = blockSamples();
// As the repository formats JSON, so that a commit's own formatting pass does
// not change what this wrote.
const options = (await resolveConfig(FIXTURE)) ?? {};
writeFileSync(
  FIXTURE,
  await format(JSON.stringify(samples), { ...options, parser: 'json' }),
);
console.log(
  `${FIXTURE}: ${samples.categories.reduce((n, c) => n + c.blocks.length, 0)} blocks in ${samples.categories.length} categories`,
);

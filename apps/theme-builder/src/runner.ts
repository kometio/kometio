import { runRequestedBuild } from './lib/build-exchange';

/*
 * The theme runner's process (docs/adr/0091): the half that runs a theme's
 * code, because building a site with a theme does. Its container has no
 * network, no capabilities, a read-only filesystem and an unprivileged
 * user; it sees the exchange directory and a scratch space, not the theme
 * volume the site is served from.
 *
 * One build, then it exits and its container starts again clean: nothing a
 * theme started survives into the next one's build.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set.`);
    process.exit(1);
  }
  return value;
}

const BUILD_TIMEOUT_MS = 10 * 60 * 1000;
const POLL_MS = 2000;

const options = {
  exchange: required('THEME_EXCHANGE_DIR'),
  workspace: process.env.THEME_BUILDER_WORKSPACE ?? '/workspace',
  scratch: required('THEME_SCRATCH_DIR'),
  timeoutMs: BUILD_TIMEOUT_MS,
};

console.log('Theme runner ready.');
for (;;) {
  const built = await runRequestedBuild(options).catch((error: unknown) => {
    console.error('The theme runner failed on a build:', error);
    return true;
  });
  if (built) process.exit(0);
  await new Promise((resolve) => setTimeout(resolve, POLL_MS));
}

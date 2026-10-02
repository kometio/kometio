import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { themeDataPaths } from '@kometio/theme-archive';
import { requestBuild } from './lib/build-exchange';
import { ThemeBuilder } from './lib/theme-builder';

/*
 * The theme builder's process (docs/adr/0091), the trusted half: it takes
 * uploads off the theme volume, hands each build to the runner, and
 * publishes what comes back. It never runs a theme's code — the runner
 * does, in a container that cannot see this volume.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set.`);
    process.exit(1);
  }
  return value;
}

/** Longer than the runner's own limit, which stops the build first. */
const BUILD_TIMEOUT_MS = 11 * 60 * 1000;
const POLL_MS = 2000;

const workspace = process.env.THEME_BUILDER_WORKSPACE ?? '/workspace';
if (existsSync(join(workspace, '.git'))) {
  console.error(
    `${workspace} is a git checkout. The theme builder runs in the builder image, not in a working tree.`,
  );
  process.exit(1);
}

const dataDirectory = required('THEME_DATA_DIR');
const exchange = required('THEME_EXCHANGE_DIR');
const coreThemes = (
  await readFile(join(workspace, '.kometio-core-themes'), 'utf8').catch(
    () => '',
  )
)
  .split('\n')
  .filter(Boolean);

const builder = new ThemeBuilder({
  dataDirectory,
  coreThemes,
  runtimeModules: process.env.THEME_RUNTIME_MODULES ?? '/app/node_modules',
  build: (request, log) =>
    requestBuild(exchange, crypto.randomUUID(), request, log, {
      timeoutMs: BUILD_TIMEOUT_MS,
      pollMs: POLL_MS,
    }),
});

// The API, which runs as its own unprivileged user, writes uploads here;
// whichever container created the volume, this directory is writable by
// it. Sticky, so an upload is only replaced by whoever wrote it — or by
// this builder, which runs as root.
const uploads = themeDataPaths(dataDirectory).uploads;
await mkdir(uploads, { recursive: true });
await chmod(uploads, 0o1777);

await builder.failInterrupted();
console.log('Theme builder ready.');
for (;;) {
  const ran = await builder.runNext().catch((error: unknown) => {
    console.error('The theme builder failed on an upload:', error);
    return false;
  });
  if (!ran) await new Promise((resolve) => setTimeout(resolve, POLL_MS));
}

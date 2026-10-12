// The image copies the launcher's files one by one (see the Dockerfile), so a
// module that is imported and not listed there is a container that cannot
// start: `Cannot find module '/opt/kometio/…'`, found only when someone runs
// the image. This follows what each entry point imports and asks the
// Dockerfile for every file on the way.
//
//   node --test docker/kometio/image-contents.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** What `node` is started on inside the image: the launcher, and the commands and checks it also runs. */
const ENTRY_POINTS = [
  'launcher.mjs',
  'cli.mjs',
  'healthcheck.mjs',
  'migrate.mjs',
];

const RELATIVE_IMPORT = /(?:from\s+|import\s*\(\s*)['"]\.\/([\w.-]+\.mjs)['"]/g;

function reachableFrom(entries) {
  const seen = new Set();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(join(here, file), 'utf8');
    for (const match of source.matchAll(RELATIVE_IMPORT)) queue.push(match[1]);
  }
  return [...seen].sort();
}

/** The files the Dockerfile copies into /opt/kometio, by their names. */
function copiedByTheDockerfile() {
  const dockerfile = readFileSync(join(here, 'Dockerfile'), 'utf8');
  const copied = new Set();
  for (const line of dockerfile.split('\n')) {
    if (!line.startsWith('COPY ')) continue;
    for (const token of line.split(/\s+/)) {
      if (token.startsWith('docker/kometio/')) copied.add(basename(token));
    }
  }
  return copied;
}

test('every module the image starts on is copied into it', () => {
  const copied = copiedByTheDockerfile();

  const missing = reachableFrom(ENTRY_POINTS).filter(
    (file) => !copied.has(file),
  );

  assert.deepEqual(
    missing,
    [],
    `imported by what the container runs, and not in the Dockerfile's COPY: ${missing.join(', ')}`,
  );
});

test('it looks at something: the launcher reaches the modules it is known to import', () => {
  const reached = reachableFrom(['launcher.mjs']);

  assert.ok(reached.includes('processes.mjs'));
  assert.ok(reached.includes('server-mode.mjs'));
});

// The version of the image is written where a person copies it from, in more
// than one file. A release that changes some and not the others sends whoever
// reads the page they trust to another version than the one it describes, and
// nothing else would say so: they are all plain text.
//
//   node --test docker/kometio/image-tag.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Where a version of the image is named as something to run. The ADRs are history and are not here. */
const PLACES = [
  'README.md',
  'docker/kometio/README.md',
  'docker/kometio/compose.yaml',
  'docker/kometio/cli.mjs',
  'docs/self-hosting.md',
];

const named = (file) =>
  [
    ...readFileSync(join(root, file), 'utf8').matchAll(
      /ghcr\.io\/kometio\/kometio:([0-9][0-9A-Za-z.+-]*)/g,
    ),
  ].map((match) => match[1]);

test('every file in the list names a version of the image', () => {
  // A file that stopped naming one belongs off the list, so that the list says
  // where a release has to look.
  for (const file of PLACES) {
    assert.notEqual(named(file).length, 0, `${file} names no version`);
  }
});

test('they all name the same one', () => {
  const versions = new Map(PLACES.map((file) => [file, new Set(named(file))]));
  const all = new Set([...versions.values()].flatMap((set) => [...set]));
  assert.equal(
    all.size,
    1,
    `more than one version is named: ${JSON.stringify(
      Object.fromEntries([...versions].map(([file, set]) => [file, [...set]])),
    )}`,
  );
});

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { linkTree } from './uploads-tree.mjs';

describe('the copy of the uploads that an archive is made from', () => {
  let root;
  let outside;
  before(() => {
    root = mkdtempSync(join(tmpdir(), 'uploads-tree-'));
    outside = join(root, 'outside-secret.txt');
    writeFileSync(outside, 'SECRET');
    const uploads = join(root, 'uploads');
    mkdirSync(join(uploads, '2026/10'), { recursive: true });
    writeFileSync(join(uploads, 'logo.png'), 'png');
    writeFileSync(join(uploads, '2026/10/photo.webp'), 'webp!');
    symlinkSync(outside, join(uploads, 'leak'));
    symlinkSync(root, join(uploads, '2026/folder-link'));
    execFileSync('mkfifo', [join(uploads, 'pipe')]);
  });
  after(() => rmSync(root, { recursive: true, force: true }));

  it('holds the files, as links to the same files, and the folders', () => {
    const copy = join(root, 'stage/uploads');

    const result = linkTree(join(root, 'uploads'), copy);

    assert.equal(result.files, 2);
    assert.equal(result.bytes, 'png'.length + 'webp!'.length);
    assert.equal(
      readFileSync(join(copy, '2026/10/photo.webp'), 'utf8'),
      'webp!',
    );
    assert.equal(
      lstatSync(join(copy, 'logo.png')).ino,
      lstatSync(join(root, 'uploads/logo.png')).ino,
      'a file is a link to the file, not a copy of it',
    );
  });

  it('leaves out a link, whatever it points at, and anything else that is not a file', () => {
    const copy = join(root, 'stage-2/uploads');

    const result = linkTree(join(root, 'uploads'), copy);

    assert.deepEqual(result.skipped.sort(), [
      '2026/folder-link',
      'leak',
      'pipe',
    ]);
    assert.equal(existsSync(join(copy, 'leak')), false);
    assert.equal(existsSync(join(copy, '2026/folder-link')), false);
    assert.equal(existsSync(join(copy, 'pipe')), false);
  });

  it('is an empty folder when there are no uploads yet', () => {
    const copy = join(root, 'stage-3/uploads');

    const result = linkTree(join(root, 'no-such-folder'), copy);

    assert.deepEqual(result, { files: 0, bytes: 0, skipped: [] });
    assert.equal(lstatSync(copy).isDirectory(), true);
  });
});

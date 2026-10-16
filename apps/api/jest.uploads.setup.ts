import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Every test file writes its uploads into a folder of its own, and takes it
// away when it is done.
//
// MEDIA_UPLOAD_DIR in a developer's .env is the folder their site's files are
// in, and the suites that upload and sweep attachments used to work in it: a
// run left its files among the real ones, and the attachments sweep removes
// whatever no submission names (it removed seventy of a developer's, once).
// The variable is still needed for the app to compile; what it points at is
// not the suites' to use.
const folder = mkdtempSync(join(tmpdir(), 'kometio-test-uploads-'));
process.env.MEDIA_UPLOAD_DIR = folder;

// And the temporary folder too. An upload that is read once and thrown away (a
// WordPress export, a theme's zip) is written to `os.tmpdir()`, which is the
// machine's: every suite of a run shares it, and a suite that counts what is
// in it before and after a request counted a file that another suite's request
// had put there a moment ago (`imports.controller.integration.spec` failed a
// pull request that changed nothing near it, with the name of another suite's
// upload as the file left behind).
//
// Not `process.env.TMPDIR`: `os.tmpdir()` asks the real process, and the one a
// test file sees is a copy. So the module is replaced for this test file, which
// is where the code under test asks it from.
const scratch = mkdtempSync(join(tmpdir(), 'kometio-test-tmp-'));
process.env.KOMETIO_TEST_TMPDIR = scratch;
jest.mock('node:os', () => {
  const actual = jest.requireActual<typeof import('node:os')>('node:os');
  return {
    ...actual,
    tmpdir: () => process.env.KOMETIO_TEST_TMPDIR ?? actual.tmpdir(),
  };
});

afterAll(() => {
  rmSync(folder, { recursive: true, force: true });
  rmSync(scratch, { recursive: true, force: true });
});

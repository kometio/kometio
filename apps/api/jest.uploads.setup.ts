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

afterAll(() => {
  rmSync(folder, { recursive: true, force: true });
});

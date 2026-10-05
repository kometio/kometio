import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ARCHIVE_FORMAT,
  ARCHIVE_FORMAT_VERSION,
  TRANSIENT_TABLES,
  appliedMigrationTags,
  archiveFileName,
  buildManifest,
  checkCompatible,
  checkEntries,
  domainOfAddress,
  parseManifest,
} from './archive.mjs';

const journal = {
  entries: [
    { tag: '0000_baseline', when: 1000 },
    { tag: '0001_forms', when: 2000 },
    { tag: '0002_ai', when: 3000 },
  ],
};
const KNOWN = ['0000_baseline', '0001_forms', '0002_ai'];
const site = {
  name: 'Bar Sport',
  domain: 'barsport.test',
  defaultLocale: 'it',
  enabledLocales: ['it', 'en'],
};
const manifestOf = (migrations) =>
  buildManifest({
    createdAt: new Date('2026-10-05T10:20:30Z'),
    site,
    migrations,
    uploads: { files: 3, bytes: 1234 },
  });

describe('what an archive says about itself', () => {
  it('names its format and carries the site, the migrations and what did not travel', () => {
    const manifest = manifestOf(KNOWN);

    assert.equal(manifest.format, ARCHIVE_FORMAT);
    assert.equal(manifest.formatVersion, ARCHIVE_FORMAT_VERSION);
    assert.deepEqual(manifest.site, site);
    assert.deepEqual(manifest.migrations, KNOWN);
    assert.ok(manifest.notIncluded.some((line) => /AI provider/.test(line)));
  });

  it('is read back as it was written', () => {
    const manifest = manifestOf(KNOWN);

    assert.deepEqual(parseManifest(JSON.stringify(manifest)), manifest);
  });

  for (const [what, text] of [
    ['not JSON', 'nope'],
    ['JSON that is not an archive', '{"a":1}'],
    ['another format', JSON.stringify({ format: 'something-else' })],
    [
      'a manifest without its migrations',
      JSON.stringify({
        format: ARCHIVE_FORMAT,
        formatVersion: 1,
        site: { name: 'x' },
      }),
    ],
  ]) {
    it(`refuses ${what}`, () => {
      assert.throws(() => parseManifest(text), /site archive/);
    });
  }

  it('names a file by when it was made, so that two exports do not meet', () => {
    assert.equal(
      archiveFileName(new Date('2026-10-05T10:20:30Z')),
      'kometio-site-20261005-1020.tar.gz',
    );
  });

  it('knows which tables hold moments and not a site', () => {
    assert.deepEqual([...TRANSIENT_TABLES].sort(), [
      'form_submissions',
      'import_jobs',
      'sessions',
      'verification_tokens',
    ]);
  });
});

describe('the migrations of a database, by name', () => {
  it('turns what the database recorded into the names the journal gives them', () => {
    assert.deepEqual(appliedMigrationTags(journal, [1000, '2000']), [
      '0000_baseline',
      '0001_forms',
    ]);
  });

  it('refuses a database that has one the code does not know: it was made by a newer version', () => {
    assert.throws(
      () => appliedMigrationTags(journal, [1000, 9999]),
      /newer one/,
    );
  });
});

describe('whether this version opens an archive', () => {
  it('opens one with exactly its migrations', () => {
    assert.doesNotThrow(() => checkCompatible(manifestOf(KNOWN), KNOWN));
  });

  it('opens an older one: the migrations it lacks run after it is restored', () => {
    assert.doesNotThrow(() =>
      checkCompatible(manifestOf(KNOWN.slice(0, 2)), KNOWN),
    );
  });

  it('refuses one with a migration this version does not have: a newer Kometio made it', () => {
    assert.throws(
      () => checkCompatible(manifestOf([...KNOWN, '0003_new']), KNOWN),
      /newer Kometio.*0003_new/,
    );
  });

  it('refuses one of a newer format', () => {
    const manifest = { ...manifestOf(KNOWN), formatVersion: 2 };

    assert.throws(() => checkCompatible(manifest, KNOWN), /newer format/);
  });

  it('refuses one whose history is not a start of this one’s', () => {
    assert.throws(
      () => checkCompatible(manifestOf(['0000_baseline', '0002_ai']), KNOWN),
      /not in the order/,
    );
  });
});

describe('what an archive may hold', () => {
  const ok = [
    'drwxr-xr-x 0/0 0 2026-10-05 10:20 .',
    '-rw-r--r-- 0/0 812 2026-10-05 10:20 ./manifest.json',
    '-rw-r--r-- 0/0 99012 2026-10-05 10:20 ./database.sql.gz',
    'drwxr-xr-x 0/0 0 2026-10-05 10:20 ./uploads',
    '-rw-r--r-- 0/0 5000 2026-10-05 10:20 ./uploads/2026/photo.webp',
  ].join('\n');

  it('accepts the three entries, as files and folders', () => {
    assert.doesNotThrow(() => checkEntries(ok));
  });

  it('refuses a link, which could point anywhere on this machine and be served as a file', () => {
    const listing = `${ok}\nlrwxrwxrwx 0/0 0 2026-10-05 10:20 ./uploads/passwd -> /etc/passwd`;

    assert.throws(
      () => checkEntries(listing),
      /not a file or a folder.*passwd/,
    );
  });

  for (const name of [
    './uploads/../../etc/x',
    '/etc/cron.d/x',
    './uploads//x',
  ]) {
    it(`refuses a name that leaves its folder: ${name}`, () => {
      const listing = `${ok}\n-rw-r--r-- 0/0 1 2026-10-05 10:20 ${name}`;

      assert.throws(() => checkEntries(listing), /leaves its folder/);
    });
  }

  it('refuses a file a site archive does not hold', () => {
    const listing = `${ok}\n-rwxr-xr-x 0/0 1 2026-10-05 10:20 ./launcher.mjs`;

    assert.throws(() => checkEntries(listing), /does not hold/);
  });

  it('refuses one without its manifest or its database', () => {
    const noManifest = ok
      .split('\n')
      .filter((line) => !line.includes('manifest'))
      .join('\n');
    const noDatabase = ok
      .split('\n')
      .filter((line) => !line.includes('database'))
      .join('\n');

    assert.throws(() => checkEntries(noManifest), /no manifest\.json/);
    assert.throws(() => checkEntries(noDatabase), /no database\.sql\.gz/);
  });
});

describe('the domain of an address', () => {
  it('is the name visitors type: no scheme, port or path, in lower case', () => {
    assert.equal(domainOfAddress('https://Example.com:8443/x'), 'example.com');
    assert.equal(domainOfAddress('http://localhost:4322'), 'localhost');
  });

  it('is nothing for an address that is an IPv6 number', () => {
    assert.equal(domainOfAddress('http://[::1]:4322'), null);
  });
});

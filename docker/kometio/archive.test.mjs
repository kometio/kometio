import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ARCHIVE_FORMAT,
  Refusal,
  ARCHIVE_FORMAT_VERSION,
  ARCHIVE_LIMITS,
  RESERVED_BYTES,
  TRANSIENT_TABLES,
  appliedMigrationTags,
  archiveFileName,
  assertDatabaseIsNotNewer,
  buildManifest,
  checkCompatible,
  checkEntries,
  checkExtractedTree,
  domainOfAddress,
  parseManifest,
  roomForArchive,
  roomForUnpacked,
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
      'audit_events',
      'form_submissions',
      'import_jobs',
      'missing_paths',
      'sessions',
      'user_recovery_codes',
      'user_second_factors',
      'verification_tokens',
    ]);
  });
});

describe('a database from before the baseline', () => {
  // The journal's first entry is a squash of the history before it
  // (docs/adr/0004): a database that went through it still has the rows of the
  // migrations the baseline replaced, older than the baseline and not in the
  // journal. They are applied and replaced, not a newer version's.
  const legacy = [500, 999];

  it('is not a newer one: its rows older than the baseline are the lineage the baseline replaced', () => {
    assert.doesNotThrow(() =>
      assertDatabaseIsNotNewer(journal, [...legacy, 1000, 2000, 3000]),
    );
  });

  it('is still refused when a newer version has migrated it as well', () => {
    assert.throws(
      () => assertDatabaseIsNotNewer(journal, [...legacy, 1000, 9999]),
      /1 migration that this version does not know/,
    );
  });

  it('refuses one that is between the baseline and the newest, which no version of this lineage wrote', () => {
    assert.throws(
      () => assertDatabaseIsNotNewer(journal, [1000, 1500, 2000]),
      /1 migration that this version does not know/,
    );
  });

  it('has its rows older than the baseline left out of the names an archive lists', () => {
    assert.deepEqual(
      appliedMigrationTags(journal, [...legacy, 1000, 2000, 3000]),
      KNOWN,
    );
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

describe('whether this image starts on a database', () => {
  it('starts on one with exactly its migrations, an older one, and a new one with none', () => {
    assert.doesNotThrow(() =>
      assertDatabaseIsNotNewer(journal, [1000, 2000, 3000]),
    );
    assert.doesNotThrow(() => assertDatabaseIsNotNewer(journal, [1000]));
    assert.doesNotThrow(() => assertDatabaseIsNotNewer(journal, []));
  });

  it('reads the times the database keeps as strings, as the driver gives them', () => {
    assert.doesNotThrow(() =>
      assertDatabaseIsNotNewer(journal, ['1000', '2000']),
    );
  });

  it('refuses one a newer version has migrated, and says what to do instead', () => {
    assert.throws(
      () => assertDatabaseIsNotNewer(journal, [1000, 2000, 9999]),
      (error) =>
        error instanceof Refusal &&
        /made by a newer Kometio than this image/.test(error.message) &&
        /1 migration that this version does not know/.test(error.message) &&
        /open the export \(or the backup\) made before the update into a new volume/.test(
          error.message,
        ),
    );
  });

  it('counts them', () => {
    assert.throws(
      () => assertDatabaseIsNotNewer(journal, [8888, 9999]),
      /2 migrations that this version does not know/,
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

  // Busybox, which is the `tar` of this image, lists a hard link as a plain file
  // (type `-`) followed by an arrow and its target, and extracts it as a link to
  // that target, an absolute path included, as root: the copy the import then
  // makes of `uploads/` would be a copy of the target, served to anyone.
  for (const target of ['/data/state/secrets.json', './uploads/photo.webp']) {
    it(`refuses a hard link, which busybox lists as a file with an arrow: -> ${target}`, () => {
      const listing = `${ok}\n-rw-r--r-- 0/0 0 2026-10-05 10:20 ./uploads/leak -> ${target}`;

      assert.throws(() => checkEntries(listing), /a link.*uploads\/leak/);
    });
  }

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

describe('what the unpacked archive is made of', () => {
  const tree = [
    { name: 'manifest.json', kind: 'file', links: 1 },
    { name: 'database.sql.gz', kind: 'file', links: 1 },
    { name: 'uploads', kind: 'directory', links: 2 },
    { name: 'uploads/2026/photo.webp', kind: 'file', links: 1 },
  ];

  it('accepts files that are their own, and folders', () => {
    assert.doesNotThrow(() => checkExtractedTree(tree));
  });

  it('refuses a file that shares its content with another: that is a hard link, whatever the listing said', () => {
    const linked = [...tree, { name: 'uploads/leak', kind: 'file', links: 2 }];

    assert.throws(() => checkExtractedTree(linked), /hard link.*uploads\/leak/);
  });

  it('refuses what is neither a file nor a folder', () => {
    const odd = [...tree, { name: 'uploads/pipe', kind: 'other', links: 1 }];

    assert.throws(
      () => checkExtractedTree(odd),
      /not a file or a folder.*uploads\/pipe/,
    );
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

describe('how big an archive may be (the sizes are declared in its listing)', () => {
  const line = (size, name) =>
    `-rw-r--r-- 0/0 ${size} 2026-10-12 10:00 ${name}`;
  const small = [
    line(1200, 'manifest.json'),
    line(5000, 'database.sql.gz'),
    line(70, 'uploads/a.webp'),
  ].join('\n');

  it('accepts what a site is, with the limits it has by default', () => {
    assert.doesNotThrow(() => checkEntries(small));
  });

  it('refuses more entries than the limit, before it looks at one', () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      line(1, `uploads/${i}`),
    ).join('\n');

    assert.throws(
      () => checkEntries(many, { entries: 5, bytes: ARCHIVE_LIMITS.bytes }),
      /holds 6 entries, more than a site archive does/,
    );
  });

  it('refuses what declares more bytes than the volume has room for, and says so before any is unpacked', () => {
    const big = [
      line(1200, 'manifest.json'),
      line(5000, 'database.sql.gz'),
      line(3 * 1024 ** 3, 'uploads/video.mp4'),
    ].join('\n');

    assert.throws(
      () => checkEntries(big, { entries: 100, bytes: 2 * 1024 ** 3 }),
      /holds more than 2.0 GiB once unpacked/,
    );
    assert.doesNotThrow(() =>
      checkEntries(big, { entries: 100, bytes: 4 * 1024 ** 3 }),
    );
  });

  it('counts the sizes of the lines, and not a number that is in a name', () => {
    const named = [
      line(10, 'manifest.json'),
      line(10, 'database.sql.gz'),
      line(10, 'uploads/999999999999 final.pdf'),
    ].join('\n');

    assert.doesNotThrow(() =>
      checkEntries(named, { entries: 10, bytes: 1000 }),
    );
  });
});

describe('what an archive may take of a volume', () => {
  it('is half of what is free above the reserve, because it is kept twice, and never more than an archive may be', () => {
    assert.equal(
      roomForArchive(RESERVED_BYTES + 10 * 1024 ** 3),
      5 * 1024 ** 3,
    );
    assert.equal(roomForArchive(10 * 1024 ** 5), ARCHIVE_LIMITS.bytes);
  });

  it('is nothing when the volume is nearly full', () => {
    assert.equal(roomForArchive(RESERVED_BYTES - 1), 0);
    assert.equal(roomForArchive(0), 0);
  });

  it('is, once unpacked, all of what is free above the reserve, and never more than an archive may be', () => {
    assert.equal(
      roomForUnpacked(RESERVED_BYTES + 10 * 1024 ** 3),
      10 * 1024 ** 3,
    );
    assert.equal(roomForUnpacked(RESERVED_BYTES - 1), 0);
    assert.equal(roomForUnpacked(10 * 1024 ** 5), ARCHIVE_LIMITS.bytes);
  });
});

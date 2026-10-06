// What a site archive is, and what it takes to trust one (docs/adr/0105). Pure:
// the commands that make and open one are in archive-commands.mjs, and the
// choices that matter are here, where they can be tested without a database.
//
// An archive is one .tar.gz holding:
//   manifest.json     what it is, where it came from, which migrations it has
//   database.sql.gz   pg_dump of the database, without the rows that describe a
//                     moment rather than a site (TRANSIENT_TABLES)
//   uploads/          the media library, as it is on disk

/**
 * A refusal: the archive, or the place it was to be opened into, is not what an
 * import needs. The reader asked for something that cannot be done and is told
 * why; it is not a failure of the program, and so it comes without the logs.
 */
export class Refusal extends Error {
  /**
   * `conflict` when what is asked is fine and the installation is not in a state
   * to do it (it already has a site), as opposed to an archive that cannot be
   * opened at all: whoever answers somebody says one as 409 and the other as 400.
   */
  constructor(message, { conflict = false } = {}) {
    super(message);
    this.conflict = conflict;
  }
}

export const ARCHIVE_FORMAT = 'kometio-site-archive';
export const ARCHIVE_FORMAT_VERSION = 1;

/**
 * Tables whose rows are not part of a site: who is signed in, the links in
 * flight (a reset, an invitation, a confirmation), what visitors submitted, and
 * the state of an import. Their structure travels, their rows do not: a copy of
 * a site starts with nobody signed in, no link that works, and no submission of
 * somebody who wrote to the other one.
 */
export const TRANSIENT_TABLES = [
  'sessions',
  'verification_tokens',
  'form_submissions',
  'import_jobs',
];

export const archiveFileName = (date) =>
  `kometio-site-${date.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-')}.tar.gz`;

/**
 * The migrations a database has applied, by name. drizzle records each one by
 * the time its journal gave it (`when`), not by its name, so the journal of the
 * code that is running is what says which is which.
 */
export function appliedMigrationTags(journal, appliedWhen) {
  const byWhen = new Map(
    journal.entries.map((entry) => [entry.when, entry.tag]),
  );
  return appliedWhen.map((when) => {
    const tag = byWhen.get(Number(when));
    if (!tag) {
      throw new Refusal(
        `this database has a migration that this version of Kometio does not know (${when}): it was made by a newer one`,
      );
    }
    return tag;
  });
}

export function buildManifest({ createdAt, site, migrations, uploads }) {
  return {
    format: ARCHIVE_FORMAT,
    formatVersion: ARCHIVE_FORMAT_VERSION,
    createdAt: createdAt.toISOString(),
    site: {
      name: site.name,
      domain: site.domain,
      defaultLocale: site.defaultLocale,
      enabledLocales: site.enabledLocales,
    },
    migrations,
    uploads,
    // What did not travel, said where the next person to open the file will read it.
    notIncluded: [
      'sessions and links in flight (a reset, an invitation, a confirmation)',
      'form submissions',
      "the AI provider's API key: it is sealed with a key of the server, which does not travel",
    ],
  };
}

/** The manifest as a value, or what is wrong with a file that claims to be one. */
export function parseManifest(text) {
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch {
    throw new Refusal(
      'this is not a Kometio site archive: its manifest is not JSON',
    );
  }
  if (manifest?.format !== ARCHIVE_FORMAT) {
    throw new Refusal('this is not a Kometio site archive: it does not say so');
  }
  if (
    typeof manifest.formatVersion !== 'number' ||
    !Array.isArray(manifest.migrations) ||
    typeof manifest.site?.name !== 'string' ||
    !manifest.migrations.every((tag) => typeof tag === 'string')
  ) {
    throw new Refusal(
      'this site archive is damaged: its manifest is incomplete',
    );
  }
  return manifest;
}

/**
 * Whether this version of Kometio can open the archive. One made by a newer
 * format, or with migrations this version does not have, was made by a newer
 * Kometio and is refused: a database cannot be taken back to a schema it has
 * not got. One made by an older one is opened, and the migrations it lacks run
 * after it is restored.
 */
export function checkCompatible(manifest, knownMigrations) {
  if (manifest.formatVersion > ARCHIVE_FORMAT_VERSION) {
    throw new Refusal(
      `this archive is of a newer format (${manifest.formatVersion}) than this version of Kometio opens (${ARCHIVE_FORMAT_VERSION}): update the image and try again`,
    );
  }
  const unknown = manifest.migrations.filter(
    (tag) => !knownMigrations.includes(tag),
  );
  if (unknown.length > 0) {
    throw new Refusal(
      `this archive was made by a newer Kometio than this one (it has the migration ${unknown[0]}): update the image and try again`,
    );
  }
  // In the order the code applies them: an archive whose history is not a start
  // of this one's was not made by this lineage of the code.
  manifest.migrations.forEach((tag, index) => {
    if (knownMigrations[index] !== tag) {
      throw new Refusal(
        `this archive's migrations are not in the order this version of Kometio applies them (at ${tag})`,
      );
    }
  });
}

/**
 * Whether the listing of an archive (`tar -tv`) holds only what an archive
 * holds: the three entries above, as plain files and directories, under their
 * own names. A link inside `uploads/` could point anywhere on this machine and
 * be served as a file of the site; a name with `..` would write outside the
 * place the archive is opened into. The file is the owner's own, but an archive
 * travels, and opening one must not be an act of trust.
 */
export function checkEntries(listing) {
  const lines = listing.split('\n').filter((line) => line.trim() !== '');
  const names = [];
  for (const line of lines) {
    const type = line[0];
    const name = line
      .replace(/^\S+\s+\S+\s+\d+\s+\S+\s+\S+\s+/, '')
      .split(' -> ')[0];
    if (type !== '-' && type !== 'd') {
      throw new Refusal(
        `this archive holds something that is not a file or a folder (${name}): it is refused`,
      );
    }
    const clean = name.replace(/^\.\//, '').replace(/\/$/, '');
    if (clean === '' || clean === '.') continue;
    if (
      clean.startsWith('/') ||
      clean.split('/').some((part) => part === '..' || part === '')
    ) {
      throw new Refusal(
        `this archive has a name that leaves its folder (${name}): it is refused`,
      );
    }
    const allowed =
      clean === 'manifest.json' ||
      clean === 'database.sql.gz' ||
      clean === 'uploads' ||
      clean.startsWith('uploads/');
    if (!allowed) {
      throw new Refusal(
        `this archive holds something a site archive does not hold (${name}): it is refused`,
      );
    }
    names.push(clean);
  }
  for (const required of ['manifest.json', 'database.sql.gz']) {
    if (!names.includes(required)) {
      throw new Refusal(
        `this site archive is incomplete: it has no ${required}`,
      );
    }
  }
}

/** The host of an address, as the site's domain: the name visitors type, with no scheme or port. */
export function domainOfAddress(address) {
  const host = new URL(address).hostname.toLowerCase();
  return host.startsWith('[') ? null : host;
}

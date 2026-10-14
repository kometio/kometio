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
  // What visitors asked for and the site did not have (docs/adr/0127): a
  // count of a moment on the server that was asked, which a copy of the site
  // does not start with — and which the new server's own visitors rewrite.
  'missing_paths',
  // Who did what on the server that was asked (docs/adr/0130): the history of
  // that installation, kept for ninety days. A copy starts its own; and an
  // archive is a file that is handed around, which the log of who signed in
  // when is not to be copied into, outside the clock that bounds it.
  'audit_events',
  // Each person's second step of sign-in (docs/adr/0137): the secret is sealed
  // with a key of the server it was made on, which does not travel, so on
  // another one it would be a row that cannot be read and that locks the
  // person out. A copy starts without it, and they turn it on again.
  'user_second_factors',
  'user_recovery_codes',
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

/**
 * Refuses to start on a database that a newer version has already migrated.
 *
 * Migrations only go forward. An older image started on that volume would run
 * its older code against a schema it does not know, which does not fail at
 * once: it writes what the newer one then reads wrongly. `docker run` of the
 * old tag after an update is how this happens, and the README's "update" is
 * what makes it likely. The refusal says what to do instead.
 */
export function assertDatabaseIsNotNewer(journal, appliedWhen) {
  const known = new Set(journal.entries.map((entry) => entry.when));
  const unknown = appliedWhen.filter((when) => !known.has(Number(when)));
  if (unknown.length > 0) {
    throw new Refusal(
      `this volume was made by a newer Kometio than this image: its database has ${unknown.length} migration${unknown.length === 1 ? '' : 's'} that this version does not know, and migrations only go forward. Start the version that made it (or a newer one) on this volume; to be on this version again, open the export (or the backup) made before the update into a new volume (docker run … import, see the README, "Move a site")`,
    );
  }
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
      "each person's two-step verification and recovery codes, for the same reason: they are turned on again on the new server",
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
 * travels: what it may hold is decided here, before anything is touched. What
 * the SQL in it says is not, and cannot be, decided from outside: it is run as
 * the database's administrator, which is why opening an archive is an act of
 * trust of the kind that installing a program is (docs/adr/0108).
 *
 * A hard link is the one that does not show in the type: busybox, whose `tar`
 * this is, lists it as a plain file (`-`) followed by ` -> ` and its target, and
 * extracts it as a link to that target, an absolute path included. Anything with
 * an arrow is refused, and `checkExtractedTree` looks again at what came out.
 */
export function checkEntries(listing, limits = ARCHIVE_LIMITS) {
  const lines = listing.split('\n').filter((line) => line.trim() !== '');
  if (lines.length > limits.entries) {
    throw new Refusal(
      `this archive holds ${lines.length.toLocaleString('en')} entries, more than a site archive does (the limit is ${limits.entries.toLocaleString('en')}): it is refused`,
    );
  }
  const names = [];
  let bytes = 0;
  for (const line of lines) {
    const type = line[0];
    bytes += Number(/^\S+\s+\S+\s+(\d+)\s/.exec(line)?.[1] ?? 0);
    if (bytes > limits.bytes) {
      throw new Refusal(
        `this archive holds more than ${gibibytes(limits.bytes)} once unpacked, more than a site archive does or than this volume has room for: it is refused`,
      );
    }
    const rest = line.replace(/^\S+\s+\S+\s+\d+\s+\S+\s+\S+\s+/, '');
    const arrow = rest.indexOf(' -> ');
    const name = arrow === -1 ? rest : rest.slice(0, arrow);
    if (type !== '-' && type !== 'd') {
      throw new Refusal(
        `this archive holds something that is not a file or a folder (${name}): it is refused`,
      );
    }
    if (arrow !== -1) {
      throw new Refusal(
        `this archive holds a link (${name}): links are refused, since one could make a copy of any file on this machine`,
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

/**
 * How big an archive may be (docs/adr/0120), whatever the person who sends it
 * says: an import is the one thing on this server that writes what a stranger
 * hands it to the disk where the database lives. A site with a hundred thousand
 * uploaded files is large and real, and a million entries is not a site.
 */
export const ARCHIVE_LIMITS = Object.freeze({
  entries: 1_000_000,
  bytes: 512 * 1024 ** 3,
});

/** What a volume keeps for itself when an archive is opened: the database has to go on writing. */
export const RESERVED_BYTES = 1024 ** 3;

const gibibytes = (bytes) => `${(bytes / 1024 ** 3).toFixed(1)} GiB`;

/** What is free on a volume, less what it keeps for itself. */
const spare = (freeBytes) => Math.max(0, freeBytes - RESERVED_BYTES);

/**
 * What an archive may declare unpacked on a volume that has `freeBytes` left:
 * all of it but what is reserved, and never more than an archive may be.
 */
export function roomForUnpacked(freeBytes) {
  return Math.min(ARCHIVE_LIMITS.bytes, spare(freeBytes));
}

/**
 * What an archive may take of the volume as it arrives. It is kept once as it
 * came and once unpacked, so each is allowed the half.
 */
export function roomForArchive(freeBytes) {
  return Math.min(ARCHIVE_LIMITS.bytes, Math.floor(spare(freeBytes) / 2));
}

/**
 * What came out of the archive, looked at again once it is on disk, since a
 * listing is text and a parser of it can be wrong in a way an archive can use:
 * only files that are their own and folders. `entries` are
 * `{ name, kind: 'file' | 'directory' | 'other', links }`, one per path, from
 * `lstat` (so a symbolic link is `other`, and a hard link has `links > 1`).
 */
export function checkExtractedTree(entries) {
  for (const { name, kind, links } of entries) {
    if (kind === 'other') {
      throw new Refusal(
        `this archive holds something that is not a file or a folder (${name}): it is refused`,
      );
    }
    if (kind === 'file' && links > 1) {
      throw new Refusal(
        `this archive holds a hard link (${name}): it shares its content with another file, and is refused`,
      );
    }
  }
}

/** The host of an address, as the site's domain: the name visitors type, with no scheme or port. */
export function domainOfAddress(address) {
  const host = new URL(address).hostname.toLowerCase();
  return host.startsWith('[') ? null : host;
}

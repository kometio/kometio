# 0109 — An export does not follow links

**Status**: Accepted — 2026-10-11. Amends the export part of ADR-0105.

## Context

ADR-0105 makes the archive from a folder with the dump, the manifest and a link to
the uploads folder, and told `tar` to follow links (`-h`), so that the uploads
are read where they are and not copied. `-h` follows every link, the ones
inside the uploads folder as well. That folder is the API's user's own, and a link
in it can point at any file of the machine.

Found on 2026-10-11 in the review of the image, and reproduced on `main`: a link
`/data/uploads/leak-link → /data/state/secrets.json`, made as the API's user, and
an export (which root makes): the archive held `uploads/leak-link` as a regular
file, 282 bytes, with the content of `secrets.json`, the application role's
password included. The API's user can ask for an export through the launcher's
socket and read the answer, so a flaw in the API that lets it write a link was
enough to read every file that only root reads.

## Decision

- **The archive is made from a folder that root made.** `stage/uploads` is a
  real folder in which every regular file of the uploads folder is a hard link to
  it (`linkTree`, `uploads-tree.mjs`): nothing is copied or read twice. A link, a
  socket or a device in the uploads folder is not in it, and the export says how
  many were left out.
- **`tar` no longer follows links.** There is none in the stage that is not the
  archive's own, and the folder is looked at once with `lstat`: a link that is put
  there after that is not in the copy, so there is nothing to race.
- Where a hard link cannot be made (the uploads on another filesystem, a file this
  process may not link) the file is copied.
- The manifest's counts are those of what is in the archive, and not of what the
  folder held.
- `check.sh` leaves a link in the uploads folder, makes an export, and expects the
  archive to hold no `leak-link`.

Chosen over: looking for links in the uploads folder before `tar` and refusing to
export while one is there. The API's user can make a link between that look and
the `tar`, and can ask for the export itself, so the look would be a check with a
gap in it.

## Consequences

- The export of a site with many files costs a hard link per file and a
  `lstat`, which is metadata only; it costs more than it did when a single link
  was made, and less than a copy.
- An archive no longer holds anything that is not a regular file of the uploads
  folder, which is what ADR-0108 asks of an archive that is opened.

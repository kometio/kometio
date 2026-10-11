# 0109 — An export is read as the API's user

**Status**: Accepted — 2026-10-11. Amends the export part of ADR-0105.

## Context

ADR-0105 makes the archive from a folder with the dump, the manifest and a link to
the uploads folder, and tells `tar` to follow links (`-h`), so that the uploads
are read where they are and not copied. `-h` follows every link, the ones
inside the uploads folder as well. That folder is the API's user's own, and a link
in it can point at any file of the machine. The export is made by root.

Found on 2026-10-11 in the review of the image, and reproduced on `main`: a link
`/data/uploads/leak-link → /data/state/secrets.json`, made as the API's user, and
an export: the archive held `uploads/leak-link` as a regular file, 282 bytes, with
the content of `secrets.json`, the application role's password included. The
API's user can ask for an export through the launcher's socket and read the
answer, so a flaw in the API that lets it write a link was enough to read every
file that only root reads.

## Decision

- **`tar` is run as the API's user.** It reads what that user owns, with that
  user's rights, and follows the links in it as far as that user could follow them:
  a link to a file that user cannot read is an error and the export is refused, with
  nothing of that file written. Nothing is read by root from a folder that the
  API's user can change, so there is no look-then-read gap to race.
- **The folder the archive is made from stays root's.** It moves from `state/`
  (root's, and the API's user cannot enter it) to `exports/`, and is root's, group
  `kometio`, `0750`: the API's user can read the dump, the manifest and the link to
  the uploads, and cannot put anything there for root to write over or to remove,
  and the site's user cannot enter it at all. Giving the folder to the API's user
  would have let it plant links for root to write through, and for the clean-up to
  walk into.
- `removeLeftoverExports` looks in both places, for the volumes of earlier versions.
- `check.sh` leaves a link in the uploads folder to a file only root reads and
  expects the export to be refused and to write nothing of it; with the link gone,
  the export is made again.

Chosen over looking for links before `tar` and refusing to export while one is
there, or making a folder of hard links to the regular files (tried first): both
read, as root, a folder that the API's user can change while root is reading it, so
a link put there between the look and the read is followed; `lstat` then `open` is
not atomic. Taking the privilege away from the reader is what closes it.

## Consequences

- An export of a site whose uploads folder holds a link to something the API's user
  cannot read fails, with `tar`'s message in the log. It does not skip it. Nothing
  of Kometio makes such a link, so what stops an export is a folder somebody
  tampered with.
- The dump is readable by the API's user for the time the export takes. That user
  can already ask for the same export through the socket.

# 0120 — What one archive, one disk and one person may take

**Status**: Accepted — 2026-10-13. Builds on
[0105](0105-a-site-archive-is-a-pg-dump-and-its-uploads.md) (the archive) and
[0013](0013-media-pipeline-local-serving-upload-time-resize.md) (uploads).

## Context

The review of 2026-10-11 found three places where a single request could take
more than anybody meant to give it, each ending in the same place — the volume
the database lives on, or a bill that is not the requester's:

- **An archive.** `import` reads whatever it is given, from a file or from the
  first-run screen, onto the volume before it looks at it. It checked what the
  archive held (names, links, a manifest) and not how much. A body with no end,
  or a small file that unpacks into a disk, filled the volume the database
  writes to.
- **A disk.** Uploads have a limit each (photos, videos) and none together. In
  the single image the uploaded files and the database are on one volume, so a
  library that fills it is a site that cannot save a page, because the
  database has nowhere to write.
- **A person.** The rate limits key on the address. An account is not tied to
  one: twenty invitations an hour is an administrator, and the same
  administrator from a hundred addresses is a hundred times that, each one a
  mail through the owner's relay. A generated page is a call the owner pays the
  provider for, with the same arithmetic.

## Decision

### An archive is bounded while it is read, and again once it is listed

- **While it arrives**, it may take at most half of what the volume has free
  above a 1 GiB reserve, and never more than 512 GiB
  (`roomForArchive`, in `docker/kometio/archive.mjs`). It is kept once as it
  came and once unpacked, hence the half. A stream that passes that is cut with
  a refusal (`limitedBytes`) and what it wrote goes with the stage: a request
  that never ends is not written until the disk is full.
- **Once it is here, before anything is unpacked**, its listing is read for
  what it declares: no more entries than a million, and no more unpacked bytes
  than what the volume has free above the reserve (`checkEntries`; the sizes are
  the third column of `tar -tv`, the number of bytes the member holds, and not
  a figure the archive can write in a name — a test holds that).
- **The numbers are not a promise about a site's size.** A site with a hundred
  thousand uploaded files is large and real; a million entries or half a
  terabyte is not a site. They are there so that what is refused is refused
  with a sentence, before the disk says it in its own way.

### A local disk keeps room for the rest of the server

- **`MEDIA_MIN_FREE_MB`, default 1024** (`0` turns the check off). A write to the
  local media or attachment storage that would leave the disk with less is
  refused with `StorageFullError`, mapped to **507 Insufficient Storage** with a
  sentence the editor shows as it is. The check is a decorator around the local
  adapters (`RoomGuardedMediaStorage`, `RoomGuardedAttachmentStorage`): the
  adapters and the use cases that call them do not change. S3 is not the
  server's disk and is not wrapped.
- **It is a floor, not a quota.** Nothing here shares the room between sites or
  people, and two uploads in flight can both pass the check; the reserve is what
  absorbs them. The first is a product question (who pays for storage), the
  second is what a gigabyte is for.

### A person is counted by who they are

- **`perUserLimit(name, limit, ttl)`** makes a guard keyed on the session's
  user, not the address. It sits behind `SessionAuthGuard`; on a route with no
  session it counts nothing and the session guard has already refused.
- **The limit is its name.** Two routes that name one limit share its count, so
  that inviting and re-sending an invitation spend one hour's twenty and not
  twenty each; two limits on one route are counted apart.
- **Two limits are set:** invitations, 20 an hour (`invite` and
  `resend-invite`), and page generations, 50 a day, beside the per-address
  limit the route already had.

## Not in this change

- **The counts are in memory.** They are the same storage the address limits use:
  one API process counts them, and a restart starts them again. Several API
  processes behind one proxy would each allow the number. The image runs one;
  moving them to the database is its own change if a deployment ever runs more.
- **No quota for uploads per site or per person**, and no limit on the size of
  the whole library: see above.
- **Nothing measures what extraction wrote.** The listing's sizes are what is
  checked, before it starts; if `tar` wrote more than it declared, the reserve
  is what is left to the database.

## Consequences

- An import that cannot fit says so in the log and on the first-run screen
  before the database is touched, and leaves the volume as it was.
- A server short of room answers uploads with 507 and a sentence, and goes on
  saving pages. The operator is told through the log at error level.
- A new route that costs money or sends mail opts in with one line:
  `@UseGuards(perUserLimit('name', n, ttl))`, or reuses one of the two.
- `MEDIA_MIN_FREE_MB` is in `.env.prod.example` and passed through
  `docker-compose.prod.yml`; the single image passes the whole environment
  through to the API already.

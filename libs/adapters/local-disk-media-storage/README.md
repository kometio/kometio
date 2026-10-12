# local-disk-media-storage

`MediaStoragePort` implementation for the curated media library — writes
what it is given to the local filesystem. The default backend. What a file
is and what becomes of it (a picture re-encoded to WebP, a download kept
under its own name) is the application's rule, not this adapter's
([ADR-0113](../../../docs/adr/0113-the-upload-policy-is-the-applications-not-the-stores.md);
the pipeline itself is
[ADR-0013](../../../docs/adr/0013-media-pipeline-local-serving-upload-time-resize.md)).
Its sibling [`@kometio/s3-media-storage`](../s3-media-storage/README.md) is
the S3-compatible alternative — **both implement the exact same
`MediaStoragePort` interface**, so the storage backend is a pure
deployment config choice.

## Implements

`MediaStoragePort` (`libs/ports/src/lib/media-storage.port.ts`) —
`put`, `getUrl`, `delete`, plus a `readonly provider` field (`'local'`)
so callers can record which backend actually stored a given `Media` row
without needing their own separate config.

## How it works

`put()` writes the bytes under the key it is given, making the
directories the key has in it, and refuses a key that would leave
`MEDIA_UPLOAD_DIR`: that one rule is the disk's own. It decides nothing
about the file — not its type, not its name, not whether a browser may
open it: the application did (`storeUpload`, `@kometio/application`), and
`StoredObject.downloadName` is the only trace of it a disk keeps, which a
disk has no use for (`media-static.ts` serves a `files/` key as a download).

`delete()` treats an already-missing file (`ENOENT`) as success, matching
`PageRepositoryPort.delete`'s idempotent-from-the-caller's-view semantics
elsewhere in the codebase, and removes the directory a key had to itself.

## Configuration

Requires `MEDIA_UPLOAD_DIR` (absolute path files are written to and
served from — `apps/api` serves this directory directly via
`express.static`, no reverse-proxy route needed) and `API_PUBLIC_URL`
(the origin returned URLs are built against). Both only enforced when
`MEDIA_STORAGE_PROVIDER` is unset or `local` — see `.env.example`.

## Used by

`apps/api` — the default (`MEDIA_STORAGE_PROVIDER` unset or `local`),
wired by `createMediaStorage()` (`apps/api/src/app/media/media.module.ts`).

## Running unit tests

Run `nx test local-disk-media-storage` to execute the unit tests via [Vitest](https://vitest.dev/).

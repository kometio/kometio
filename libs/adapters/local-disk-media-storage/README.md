# local-disk-media-storage

`MediaStoragePort` implementation for the curated media library —
processes every upload and writes it to the local filesystem. The default
backend; see
[ADR-0013](../../../docs/adr/0013-media-pipeline-local-serving-upload-time-resize.md)
for the upload-time-resize design and why it's a fixed-quality WebP
conversion rather than a size ladder. Its sibling
[`@kometio/s3-media-storage`](../s3-media-storage/README.md) is the
S3-compatible alternative — **both implement the exact same
`MediaStoragePort` interface** and are given the same image optimizer, so the storage backend is a pure deployment config choice.

## Implements

`MediaStoragePort` (`libs/ports/src/lib/media-storage.port.ts`) —
`upload`, `getUrl`, `delete`, plus a `readonly provider` field (`'local'`)
so callers can record which backend actually stored a given `Media` row
without needing their own separate config.

## How it works

The bytes decide what a file is (`classifyUpload`, ADR-0054/0070). A file
the bytes cannot vouch for is kept under `files/` with the name it was
uploaded as, to be downloaded and never opened; a video or audio file is
written as it is. A picture goes through the `ImageOptimizerPort` it was
given (`@kometio/sharp-image-optimizer`): turned the right way up, scaled
down to at most 1600 px and re-encoded to WebP. The returned
`mimeType`/`width`/`height` are those of the stored file, never the
caller's. A file that starts like a picture and cannot be decoded is
refused with `UnreadableImageError` (a 400) and nothing is written.

One optimized version per upload, not a thumbnail ladder — deliberately
scoped down for now (see ADR-0013 for the rationale and the note on
revisiting if multiple rendition sizes become a real need later).
`delete()` treats an already-missing file (`ENOENT`) as success, matching
`PageRepositoryPort.delete`'s idempotent-from-the-caller's-view semantics
elsewhere in the codebase.

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

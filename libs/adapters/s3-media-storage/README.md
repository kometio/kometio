# s3-media-storage

`MediaStoragePort` implementation for the curated media library — the
same as `@kometio/local-disk-media-storage`, but what it is given is put in
an S3 (or S3-compatible, e.g. MinIO) bucket instead of written to the local
filesystem. What a file is and what becomes of it is the application's rule
([ADR-0113](../../../docs/adr/0113-the-upload-policy-is-the-applications-not-the-stores.md);
the pipeline is
[ADR-0013](../../../docs/adr/0013-media-pipeline-local-serving-upload-time-resize.md)).
Both this and its LocalDisk sibling **implement the exact same
`MediaStoragePort` interface**, selected per deployment via
`MEDIA_STORAGE_PROVIDER` — a swap, not a code fork.

## Implements

`MediaStoragePort` (`libs/ports/src/lib/media-storage.port.ts`) —
`put`, `getUrl`, `delete`, `readonly provider = 's3'`.

## How it works

`put()` sends a `PutObjectCommand` with the key, the bytes and the type it
was given — and, for a download (`downloadName`), the
`Content-Disposition: attachment` header, which has to be stored WITH the
object because the bucket serves it and no application is in the path to
add it later. The name is written into the header with what would end its
quoted string escaped, so that it cannot add a parameter of its own. What
the file is, and which of these it gets, was decided before it arrived
(`storeUpload`, `@kometio/application`) — this used to be two copies of the
pipeline, one here and one in the local adapter.

Storage itself uses `@aws-sdk/client-s3`'s `PutObjectCommand`/
`DeleteObjectCommand`. `endpoint`/`forcePathStyle` target an
S3-compatible backend like MinIO instead of real AWS S3 (MinIO requires
path-style bucket URLs; AWS S3 works with either). `delete()` doesn't
special-case a missing key — S3's `DeleteObjectCommand` doesn't error on
one, so no `ENOENT`-style catch is needed (unlike the LocalDisk sibling).

## Configuration

Requires `S3_MEDIA_BUCKET`, `S3_MEDIA_REGION`, `S3_MEDIA_ACCESS_KEY_ID`,
`S3_MEDIA_SECRET_ACCESS_KEY`, `S3_MEDIA_PUBLIC_BASE_URL` (the origin, or a
CDN in front of the bucket, returned URLs are built against), plus
optional `S3_MEDIA_ENDPOINT` and `S3_MEDIA_FORCE_PATH_STYLE`. All only
enforced once `MEDIA_STORAGE_PROVIDER=s3` is selected — a LocalDisk-only
deployment never needs to set S3 credentials just to boot. See
`.env.example`.

## Used by

`apps/api` — used when `MEDIA_STORAGE_PROVIDER=s3`, wired by
`createMediaStorage()` (`apps/api/src/app/media/media.module.ts`).

## Running unit tests

Run `nx test s3-media-storage` to execute the unit tests via [Vitest](https://vitest.dev/).

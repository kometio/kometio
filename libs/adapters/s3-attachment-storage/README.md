# s3-attachment-storage

`AttachmentStoragePort` implementation that writes a form's uploaded
files to an S3 (or S3-compatible, e.g. MinIO) bucket, no processing of
any kind. See
[ADR-0020](../../../docs/adr/0020-form-builder-anti-spam-newsletter-attachments-multistep.md)
and its sibling
[`@kometio/local-disk-attachment-storage`](../local-disk-attachment-storage/README.md)
— **both implement the exact same `AttachmentStoragePort` interface**,
swappable per deployment via `MEDIA_STORAGE_PROVIDER`.

## Implements

`AttachmentStoragePort` (`libs/ports/src/lib/attachment-storage.port.ts`)
— a single `upload(input)` method, no `getUrl`/`delete`.

## How it works

Raw bytes in, raw bytes out — no image conversion, unlike this lib's
`@kometio/s3-media-storage` sibling. Objects are written to
`attachments/<formId>/<uuid>.<extension>` inside the configured bucket via
`@aws-sdk/client-s3`'s `PutObjectCommand`, using the same `attachments/`
key-prefix convention as the LocalDisk adapter to keep form attachments
out of the curated media library's key space. `endpoint`/
`forcePathStyle` exist to target an S3-compatible backend like MinIO
instead of real AWS S3 — path-style addressing (`forcePathStyle: true`)
is required by MinIO, optional on real S3.

## Configuration

Deliberately **reuses** `MediaStoragePort`'s own S3 env vars —
`S3_MEDIA_BUCKET`, `S3_MEDIA_REGION`, `S3_MEDIA_ENDPOINT` (optional),
`S3_MEDIA_FORCE_PATH_STYLE` (optional), `S3_MEDIA_ACCESS_KEY_ID`,
`S3_MEDIA_SECRET_ACCESS_KEY`, `S3_MEDIA_PUBLIC_BASE_URL` — rather than a
separate `ATTACHMENT_STORAGE_PROVIDER`/set of S3 vars. A deployment that
already chose S3 for media almost certainly wants attachments there too;
see `.env.example`.

## Used by

`apps/api` — used when `MEDIA_STORAGE_PROVIDER=s3`, wired by
`createAttachmentStorage()`
(`apps/api/src/app/attachment-storage.factory.ts`).

## Running unit tests

Run `nx test s3-attachment-storage` to execute the unit tests via [Vitest](https://vitest.dev/).

# local-disk-attachment-storage

`AttachmentStoragePort` implementation that writes a form's uploaded
files straight to the local filesystem, no processing of any kind. The
default (and only free) backend for form file-upload fields; see
[ADR-0020](../../../docs/adr/0020-form-builder-anti-spam-newsletter-attachments-multistep.md)
for why attachments got their own port instead of reusing
`MediaStoragePort`, and its sibling
[`@kometio/s3-attachment-storage`](../s3-attachment-storage/README.md) for
the S3-compatible alternative — **both implement the exact same
`AttachmentStoragePort` interface**, so which one runs is a deployment
config choice, not a code fork.

## Implements

`AttachmentStoragePort` (`libs/ports/src/lib/attachment-storage.port.ts`)
— a single `upload(input)` method. Unlike `MediaStoragePort`, there is no
`getUrl`/`delete`: nothing needs to re-resolve a stored attachment key
later, and attachments aren't curated/browsable like the media library.

## How it works

Raw bytes in, raw bytes out — `mimeType`/`extension` on `input` must
already be the sniffed, verified values (never the client-declared
`filename`, since the file-upload endpoint is unauthenticated). Files are
written under `${uploadDir}/attachments/<formId>/<uuid>.<extension>`, a **subfolder
of the same directory `LocalDiskMediaStorageAdapter` already serves** via
`apps/api`'s `express.static` — no extra route needed — but kept under
its own `attachments/` prefix so a form attachment (which might be a
PDF/DOCX) is never mistaken for a curated media-library image. One folder
per form, because `urlPrefixFor(formId)` is how a submission proves its
file is one of that form's uploads; a form id that is not a uuid is
refused rather than joined into a path.

## Configuration

Deliberately **reuses** `MediaStoragePort`'s own env vars —
`MEDIA_UPLOAD_DIR` and `API_PUBLIC_URL` — rather than introducing
attachment-specific ones. Same underlying storage infrastructure choice
per deployment as the media library, just a different concern; splitting
it into its own variable would be one more thing to keep in sync for no
real benefit at this scale.

## Used by

`apps/api` — the default when `MEDIA_STORAGE_PROVIDER` is unset or
`local`, wired by `createAttachmentStorage()`
(`apps/api/src/app/attachment-storage.factory.ts`).

## Running unit tests

Run `nx test local-disk-attachment-storage` to execute the unit tests via [Vitest](https://vitest.dev/).

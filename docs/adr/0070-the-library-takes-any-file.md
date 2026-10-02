# 0070 — The library takes any file, and opens only what it can vouch for

**Status**: Accepted — 2026-09-13. Amends [0054](0054-hosted-video-and-audio.md).

## Context

ADR-0054 made the file's own bytes the only thing that decides what an
upload is, and refused everything that was not on a short allow-list:
raster images, two video containers, three audio containers. That was a
security decision — every one of those formats is served inline, and
none of them can execute anything — and it worked.

It was also a product limit the owner did not want. A site keeps price
lists, brochures, menus as PDF, spreadsheets, archives, fonts, the
designer's SVG logo. Each of those was refused with a generic error, and
the only way to put one on a page was to host it somewhere else.

The owner's decision, on 2026-09-12: the library must take any file;
checking what is inside it is not our job, the uploader is warned, and
that is all.

Taking any file does not settle how it is SERVED, and that part stays
ours. A `.html` or `.svg` opened in place from the editor's origin runs
its scripts with the session of whoever clicked it — one wrong file from
a collaborator is enough to take the administrator's login. The owner
chose, among the options put to them, that such files download rather
than open.

## Decision

**Nothing is refused for its type. What is opened in place is still
decided by the bytes.**

- `classifyUpload` (`@kometio/domain-core`) asks the sniffer first. A file
  whose bytes match the allow-list is what they say, whatever it is
  called, and is served inline exactly as before — images still go
  through sharp.
- Any other file is taken on its name: a MIME type from its extension, or
  `application/octet-stream`. It is stored under
  `files/<uuid>/<its own name, made safe>` and is never served inline.
  Keeping the name in the last path segment is what makes a download
  arrive as `listino-2026.pdf` rather than as a UUID.
- Serving: `media-static.ts` sends `Content-Disposition: attachment` for
  everything under `files/` (and, as before, `attachments/`). The S3
  adapter writes the same header onto the object, because the bucket
  serves it and our API is not in the path.
- Five kinds instead of three — image, video, audio, document, other —
  defined once in `@kometio/shared-types` (`mediaKindOfMime`), which the
  API filter, the SQL behind it and the editor all use. The size limits
  gain a row each: 20 MB for a document, the request's own 64 MB for
  anything else.
- A block field says which kind it takes (`control: 'media'` for an image,
  as it always meant, and the new `'video'` and `'audio'`), and the
  picker offers nothing else. Until now every field offered every file,
  so a video field could be given a photo; with PDFs in the library an
  image field could have been given one.
- The editor says, next to the upload button, that nothing uploaded is
  checked.

### The bypass this closed

The download rule used to be a mount per directory, matched on the URL.
The URL is not the file: `/uploads/%61ttachments/x.pdf` does not match
`/uploads/attachments`, falls through to the general mount, and
serve-static decodes it back to the same file — served inline. Measured
against the running API on 2026-09-13 for form attachments, which had
been relying on that header as their second barrier. The rule is now
decided by the file's resolved path on disk, compared case-insensitively,
in a single mount.

## Consequences

- An SVG is filed with the images and can be placed in an `<img>` — a
  page loading a subresource ignores `Content-Disposition` — but opening
  its address directly downloads it.
- A file that pretends to be a PNG is filed as an image by its name and
  is still only ever a download: the name decides the folder, never
  whether a browser runs it.
- There is no antivirus, by decision. The warning is the product's whole
  answer, and it says so.

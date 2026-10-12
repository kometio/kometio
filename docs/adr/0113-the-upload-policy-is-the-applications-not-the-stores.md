# 0113 — The upload policy is the application's, not the stores'

**Status**: Accepted — 2026-10-12. Amends [0013](0013-media-pipeline-local-serving-upload-time-resize.md).

## Context

`MediaStoragePort.upload(input)` took the file and decided everything: it
classified the bytes ([ADR-0054](0054-hosted-video-and-audio.md)),
refused or kept what they did not vouch for as a download under its own
directory and name ([ADR-0070](0070-the-library-takes-any-file.md)), had a
picture re-encoded, named the key. Each of the two adapters (local disk, S3)
wrote that out in full, with a third copy in the in-memory fake the use-case
tests run on, and each carried its own spec of it. The two had already
drifted once (the corrupt-image refusal was added to one and then
extracted).

The rules were also in the wrong layer. The size a kind may be was the
application's (`uploadMedia`), applied after classifying the bytes **again**;
the profile picture re-implemented the same classification and limit before
handing the bytes on. Whether a file is a download is a decision about what
this application serves, not about where the bytes are kept: a store that is
swapped for another (a second S3 vendor, a CDN origin) should not need to
learn it.

## Decision

- **The port stores.** `MediaStoragePort.put({ key, data, contentType,
downloadName? })`, `getUrl`, `delete`. It decides nothing about the file.
  The only rule a store keeps is its own: the local disk refuses a key that
  would leave its directory; S3 writes `downloadName` into the
  `Content-Disposition` it stores with the object (the bucket serves it, with
  no application in the path), with what would end the quoted string
  escaped.
- **`storeUpload` is the policy**, in `@kometio/application`, used by the
  library's upload and by the profile picture: bytes decide what a file is;
  a file they do not vouch for is a download under `files/<uuid>/<name>`; a
  picture goes through the `ImageOptimizerPort` once; the rest is kept as
  uploaded under its sniffed type. The caller passes what it classified, so
  the bytes are read once.
- **The image optimizer is a dependency of the use cases**, not of the
  stores. The adapters no longer depend on `sharp` or on the domain.
- The spec of the policy is one, in the application, run against fakes;
  each store's spec says what that store does with what it is given.

## Alternatives not taken

- **A shared base class for the two adapters.** Removes the second copy of
  the rules and leaves them in the adapters' layer, where the profile
  picture and the library would still each need to reach them through a
  port that classifies.
- **A free function in `domain-core` that returns a plan, with the port
  unchanged.** Moves the rules to the right layer but keeps a port whose
  `upload` re-derives what the plan said.

## Consequences

- A change to what the library keeps, or under what name, is a change in
  one function and one spec; a new store implements three methods.
- A key is chosen by the application, from a UUID and an extension it
  decided on: nothing a client sent reaches a path except through
  `safeDownloadName`, which is under test.
- `upload` is gone from the port: a caller outside this repository that
  implemented it has to move to `put`.
- Not changed: the form-attachment store, which has its own port, its own
  key shape (`attachments/<form>/<uuid>.<ext>`) and its own listing and sweep.
  It repeats the key rule in two adapters and could take the same
  treatment; it is a different decision (what an attachment's address is) and
  is left for its own change.

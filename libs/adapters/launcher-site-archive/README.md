# launcher-site-archive

`SiteArchivePort` for the single Docker image (docs/adr/0105): the archive of a
site, asked of the launcher that runs the image's own database. The API is not
given the means to dump that database (it has no administrator's credentials, and
`kometio_app` is under row level security), so it asks, over a Unix socket only
its own user can open, and streams the answer to whoever asked.

## Implements

- `SiteArchivePort.export()` — `GET /export` on the launcher's socket. Resolves
  with `{ fileName, content }` as soon as the archive has begun: `content` is the
  `.tar.gz` as the launcher writes it, and an error on its way is an error of
  `content`, never an end that looks whole. A refusal (409: no site yet, or another
  archive is being made) is a `SiteArchiveRefusedError` with the launcher's own
  words; any other answer is an `Error` carrying what the launcher said, to be
  logged and not shown.
- The file name is taken from the launcher's `Content-Disposition` and only if it is
  made of letters, digits, dots, dashes and underscores: it ends up in a header of
  the API's own answer, as it is.

## Configuration

One `socketPath`, which the launcher gives the API as `KOMETIO_CONTROL_SOCKET`. With
a database that is not the image's own the launcher does not listen, the variable is
not set, and the API wires no adapter (`SITE_ARCHIVE` is `null`).

## Used by

`apps/api`, in `AdaptersModule`; `SiteArchiveController`
(`apps/api/src/app/site-archive`) streams it to the browser.

## Running unit tests

Run `nx test @kometio/launcher-site-archive` to execute the unit tests via
[Vitest](https://vitest.dev/): they talk to a fake launcher on a socket of their
own.

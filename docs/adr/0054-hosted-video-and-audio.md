# 0054 — Hosted video and audio, and what an upload is allowed to be

**Status**: Accepted — 2026-09-08. Amended by [0070](0070-the-library-takes-any-file.md): files outside the allow-list are no longer refused, they are kept and served as downloads.

## Context

`VideoEmbed` points at YouTube or Vimeo. There was no way to serve a video
the site owns, and none at all for audio — no podcast episode, no recorded
message, no track.

Accepting those meant looking at the upload path, and the first thing that
look produced was **a correction to an earlier assessment**. PR #157's
description said the media endpoint applied no server-side MIME allow-list
and served files inline, and framed that as a hole. It is not one, for
images: every storage adapter puts each upload through sharp, which
re-encodes to WebP. A file that is not really an image fails to decode; one
that is comes out as raster pixels with nothing executable left. That
re-encoding is a **stronger** guarantee than any allow-list — which is why
the media table contains nothing but `image/webp`.

The gap opens with video and audio, and only there. sharp cannot read
them, transcoding is a different kind of program entirely, and so they
have to be stored exactly as uploaded and served inline for a `<video>`
element to play them. For those, the bytes are the only check there will
ever be.

## Decision

### The bytes decide, and nothing else

`sniffMediaType` reads an upload's first sixteen bytes against a short
allow-list — PNG, JPEG, GIF, WebP, AVIF, MP4, WebM, MP3, Ogg, WAV — and
refuses everything else. The declared MIME type is not an argument to the
function: a caller can rename a file and set any header it likes, and the
bytes are the one thing it cannot fake.

SVG is absent on purpose. It is the format that would matter, being both
"an image" to a file picker and a document that can carry script.

Two RIFF formats share their first four bytes, and only byte 8 tells a
WebP image from a WAV sound — filing one as the other would hand a sound
file to an `<img>`. That case has its own test.

### Limits differ by kind

One number could not serve both: 10MB is generous for a photo and useless
for a video, while a ceiling big enough for video would wave through a
mis-picked RAW image.

| kind  | limit            |
| ----- | ---------------- |
| image | 10MB — unchanged |
| audio | 20MB             |
| video | 64MB             |

The video ceiling is deliberately modest. Self-hosted video is for a short
clip — a product loop, a testimonial — and anything longer is better
served by `VideoEmbed`, which costs the site owner no bandwidth. It is
also a memory decision: uploads are buffered in memory, so the ceiling is
what one request can hold.

Multer keeps a single limit, necessarily — it cannot know what a file is
before reading it — set to the largest any kind may be. The real per-kind
limit is applied in `uploadMedia`, which sniffs first and can therefore
say which limit was exceeded.

### Sniffed twice, deliberately

`uploadMedia` sniffs to choose the limit; the storage adapter sniffs again
to decide how to store. The same two-barrier shape the CSS override path
uses: the first guards the rule, the second guards the write, and neither
depends on the other having run.

### Serving

Media stays inline — a `<video>` cannot play a file the server told the
browser to save — with `nosniff` added. Public form attachments keep their
forced download: they come from unauthenticated visitors, which is a
different threat entirely.

That configuration now lives in one function shared with the integration
tests. It had to: the tests mounted their own bare `express.static`, so a
test asserting a response header was really asserting its own setup, and
would have kept passing if production lost the header completely. The test
that now checks `nosniff` on a served video failed until this was fixed —
correctly, because until then it was checking the wrong thing.

### The blocks

`VideoFile` and `Audio`. Autoplay implies muted, enforced in the renderer
rather than the schema: every browser refuses to start an unmuted video on
its own, so an autoplaying video with sound simply never plays, and
silently muting it is what the person who ticked the box meant. `poster`
is a separate image because a browser otherwise shows the first frame, and
the first frame of a video is very often black.

## Consequences

Fifty-nine blocks. `VideoEmbed` and `VideoFile` both exist and both should:
an embed costs no bandwidth but brings a third party, its player and its
cookies — which is why `VideoEmbed` sits behind a consent gate — while a
hosted clip has no third party and nothing to gate.

Dimensions are not read for video: doing so means decoding the container,
a different dependency again. `width`/`height` are nullable for exactly
this, and nothing in the renderer needs them.

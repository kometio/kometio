# sharp-image-optimizer

`ImageOptimizerPort` implementation: what every uploaded picture goes
through before it is stored. Turns it the right way up (EXIF orientation),
scales it down to at most 1600 px on a side and converts it to WebP — one
optimized version per upload, not a ladder of sizes
([ADR-0013](../../../docs/adr/0013-media-pipeline-local-serving-upload-time-resize.md)).

It is handed to both media storage adapters
([`@kometio/local-disk-media-storage`](../local-disk-media-storage/README.md)
and [`@kometio/s3-media-storage`](../s3-media-storage/README.md)), which used
to carry a copy of this each: a picture becomes the same thing wherever it
is kept, and a file that starts like a picture and cannot be decoded is
refused once, as `UnreadableImageError` (a 400), not by two copies of a
`try`.

## Implements

`ImageOptimizerPort` (`libs/ports/src/lib/image-optimizer.port.ts`) —
`optimize(data)`.

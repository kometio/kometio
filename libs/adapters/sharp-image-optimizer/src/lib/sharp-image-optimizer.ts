import sharp from 'sharp';
import { UnreadableImageError } from '@kometio/domain-core';
import type { ImageOptimizerPort, OptimizedImage } from '@kometio/ports';

// One optimized version per upload (resized if oversized, converted to
// WebP), not a size ladder — see ADR-0013 for why, and the note on
// extending this later if a real need for separate thumbnails shows up.
const MAX_DIMENSION_PX = 1600;
const WEBP_QUALITY = 82;

/** `ImageOptimizerPort` on sharp (libvips). */
export class SharpImageOptimizer implements ImageOptimizerPort {
  async optimize(data: Uint8Array): Promise<OptimizedImage> {
    try {
      // rotate() with no args: auto-orients from EXIF before anything else —
      // otherwise a resize can silently bake in a sideways/upside-down photo.
      const source = sharp(data).rotate();
      const metadata = await source.metadata();
      const oversized =
        (metadata.width ?? 0) > MAX_DIMENSION_PX ||
        (metadata.height ?? 0) > MAX_DIMENSION_PX;

      const pipeline = oversized
        ? source.resize({
            width: MAX_DIMENSION_PX,
            height: MAX_DIMENSION_PX,
            fit: 'inside',
            withoutEnlargement: true,
          })
        : source;

      const buffer = await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer();
      const output = await sharp(buffer).metadata();
      return {
        data: buffer,
        mimeType: 'image/webp',
        extension: 'webp',
        width: output.width ?? 0,
        height: output.height ?? 0,
      };
    } catch (error) {
      // sharp reports a file it cannot decode as a plain Error, from the
      // header read or from the decode itself, with nothing to tell the two
      // apart. Everything it throws here is about THESE bytes: a missing
      // native library would have failed at import, not on a call.
      throw new UnreadableImageError({ cause: error });
    }
  }
}

/** An image as it is stored: turned the right way up, no larger than the library keeps, in one format. */
export interface OptimizedImage {
  data: Uint8Array;
  mimeType: 'image/webp';
  /** No leading dot. */
  extension: 'webp';
  width: number;
  height: number;
}

/**
 * What every uploaded picture goes through before it is stored (ADR-0013):
 * one optimized version, not a ladder of sizes. Implemented by
 * `@kometio/sharp-image-optimizer`, and handed to both media storage adapters,
 * so what a picture becomes does not depend on where it is kept.
 */
export interface ImageOptimizerPort {
  /**
   * Throws `UnreadableImageError` when the bytes have an image's signature
   * and are not an image that can be decoded — cut short, damaged, or
   * something else behind a picture's first bytes.
   */
  optimize(data: Uint8Array): Promise<OptimizedImage>;
}

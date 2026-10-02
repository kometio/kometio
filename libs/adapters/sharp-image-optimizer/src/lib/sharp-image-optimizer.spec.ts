import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { UnreadableImageError } from '@kometio/domain-core';
import { SharpImageOptimizer } from './sharp-image-optimizer';

const optimizer = new SharpImageOptimizer();

async function png(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 100, b: 50 },
    },
  })
    .png()
    .toBuffer();
}

describe('SharpImageOptimizer', () => {
  it('re-encodes a small picture to WebP without resizing it', async () => {
    const image = await optimizer.optimize(await png(400, 300));

    expect(image.mimeType).toBe('image/webp');
    expect(image.extension).toBe('webp');
    expect([image.width, image.height]).toEqual([400, 300]);
    // What it says it is, not just what it is called.
    expect((await sharp(image.data).metadata()).format).toBe('webp');
  });

  it('scales an oversized picture down to 1600 px on its longer side', async () => {
    const image = await optimizer.optimize(await png(3000, 1500));

    expect([image.width, image.height]).toEqual([1600, 800]);
  });

  it('never scales a small picture up', async () => {
    const image = await optimizer.optimize(await png(100, 50));

    expect([image.width, image.height]).toEqual([100, 50]);
  });

  it('turns a photo the right way up before anything else, so a resize cannot bake it in sideways', async () => {
    // 200 wide, 100 tall, marked "rotate 90°": it is a portrait.
    const sideways = await sharp({
      create: {
        width: 200,
        height: 100,
        channels: 3,
        background: { r: 10, g: 10, b: 10 },
      },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const image = await optimizer.optimize(sideways);

    expect([image.width, image.height]).toEqual([100, 200]);
  });

  describe('a file that starts like a picture and is not one', () => {
    it.each([
      ['cut short', async () => (await png(40, 40)).subarray(0, 60)],
      [
        'with a byte damaged',
        async () => {
          const good = await png(40, 40);
          good[good.length - 20] ^= 0xff;
          return good;
        },
      ],
      [
        'plain text behind the signature',
        async () =>
          Buffer.concat([
            (await png(40, 40)).subarray(0, 16),
            Buffer.from('not a picture, only bytes'),
          ]),
      ],
    ])('is refused as an UnreadableImageError: %s', async (_what, make) => {
      const error = await optimizer
        .optimize(await make())
        .then(() => null)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(UnreadableImageError);
      // What the decoder said is kept for whoever reads the log.
      expect((error as UnreadableImageError).cause).toBeInstanceOf(Error);
    });
  });
});

import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { decodeImage, InvalidImageError } from '../src/pipeline.js';

/** Solid-color image of the given square size — a tiny compressed file whatever the dimensions. */
function solidPng(size: number): Promise<Buffer> {
  return sharp({
    create: { width: size, height: size, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .png()
    .toBuffer();
}

describe('decodeImage megapixel guard', () => {
  it('rejects an image over the 12 MP limit (decompression-bomb defense)', async () => {
    // 5000x5000 = 25 MP: a ~340 KB solid PNG that would decode to a 100 MB RGBA plane.
    const bomb = await solidPng(5000);
    await expect(decodeImage(bomb)).rejects.toBeInstanceOf(InvalidImageError);
    await expect(decodeImage(bomb)).rejects.toThrow(/megapixels/i);
  });

  it('decodes a small image and a 9 MP image (the frontend downscale target) unchanged', async () => {
    for (const size of [800, 3000]) {
      const px = await decodeImage(await solidPng(size));
      expect(px.width).toBe(size);
      expect(px.height).toBe(size);
    }
  });
});

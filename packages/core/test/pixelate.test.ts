import { describe, expect, it } from 'vitest';
import { pixelate } from '../src/image/pixelate.js';
import type { PixelBuffer } from '../src/types.js';

function makeBuffer(
  width: number,
  height: number,
  fill: (x: number, y: number) => [number, number, number],
): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fill(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

describe('pixelate', () => {
  it('averages a uniform solid-color image to itself', () => {
    const source = makeBuffer(8, 8, () => [50, 100, 150]);
    const cells = pixelate(source, { x: 0, y: 0, width: 8, height: 8 }, 4, 4);
    expect(cells).toHaveLength(16);
    for (const cell of cells) {
      expect(cell).toEqual({ r: 50, g: 100, b: 150 });
    }
  });

  it('exact 1:1 downsample reproduces the source pixel-for-pixel', () => {
    const source = makeBuffer(4, 2, (x, y) => [x * 10, y * 10, 0]);
    const cells = pixelate(source, { x: 0, y: 0, width: 4, height: 2 }, 4, 2);
    expect(cells).toEqual([
      { r: 0, g: 0, b: 0 },
      { r: 10, g: 0, b: 0 },
      { r: 20, g: 0, b: 0 },
      { r: 30, g: 0, b: 0 },
      { r: 0, g: 10, b: 0 },
      { r: 10, g: 10, b: 0 },
      { r: 20, g: 10, b: 0 },
      { r: 30, g: 10, b: 0 },
    ]);
  });

  it('averages left/right halves of a two-tone image when downsampling to 1x1 per half', () => {
    // 4x1 image: left half black, right half white -> 2x1 grid should be [black, white]
    const source = makeBuffer(4, 1, (x) => (x < 2 ? [0, 0, 0] : [255, 255, 255]));
    const cells = pixelate(source, { x: 0, y: 0, width: 4, height: 1 }, 2, 1);
    expect(cells).toEqual([
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 255, b: 255 },
    ]);
  });

  it('respects the crop rectangle', () => {
    const source = makeBuffer(4, 1, (x) => (x < 2 ? [0, 0, 0] : [255, 255, 255]));
    // Crop to only the white half.
    const cells = pixelate(source, { x: 2, y: 0, width: 2, height: 1 }, 1, 1);
    expect(cells).toEqual([{ r: 255, g: 255, b: 255 }]);
  });

  it('handles upsampling (grid larger than crop) without throwing and stays deterministic', () => {
    const source = makeBuffer(2, 2, (x, y) => [x * 100, y * 100, 0]);
    const a = pixelate(source, { x: 0, y: 0, width: 2, height: 2 }, 6, 6);
    const b = pixelate(source, { x: 0, y: 0, width: 2, height: 2 }, 6, 6);
    expect(a).toEqual(b);
    expect(a).toHaveLength(36);
  });

  it('is deterministic across repeated calls on a non-trivial image', () => {
    const source = makeBuffer(37, 29, (x, y) => [(x * 7) % 256, (y * 13) % 256, (x + y) % 256]);
    const a = pixelate(source, { x: 3, y: 2, width: 30, height: 25 }, 12, 10);
    const b = pixelate(source, { x: 3, y: 2, width: 30, height: 25 }, 12, 10);
    expect(a).toEqual(b);
  });

  it('clamps an out-of-bounds crop rect to the source image', () => {
    const source = makeBuffer(4, 4, () => [7, 8, 9]);
    const cells = pixelate(source, { x: -5, y: -5, width: 1000, height: 1000 }, 2, 2);
    for (const cell of cells) {
      expect(cell).toEqual({ r: 7, g: 8, b: 9 });
    }
  });
});

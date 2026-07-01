import type { CropRect, PixelBuffer, RGB } from '../types.js';
import { axisBounds, clampCrop } from './cellBounds.js';

/**
 * Deterministic box-filter downsample (or nearest-neighbor upsample) of a crop region of
 * `source` into a `gridWidth` x `gridHeight` grid of averaged RGB colors (alpha is ignored;
 * fully-transparent source pixels are treated as opaque for averaging purposes).
 *
 * Each output cell averages every source pixel whose integer coordinates fall in its
 * proportional sub-rectangle of the crop region, using fixed integer boundary math
 * (`Math.floor`) and a fixed row-major traversal order, so the same input always produces
 * byte-identical output.
 */
export function pixelate(
  source: PixelBuffer,
  cropInput: CropRect,
  gridWidth: number,
  gridHeight: number,
): RGB[] {
  if (gridWidth < 1 || gridHeight < 1) {
    throw new Error(`gridWidth/gridHeight must be >= 1, got ${gridWidth}x${gridHeight}`);
  }
  const crop = clampCrop(cropInput, source.width, source.height);
  const cells: RGB[] = new Array(gridWidth * gridHeight);

  for (let cy = 0; cy < gridHeight; cy++) {
    const [srcY0, srcY1] = axisBounds(crop.y, crop.height, gridHeight, cy);

    for (let cx = 0; cx < gridWidth; cx++) {
      const [srcX0, srcX1] = axisBounds(crop.x, crop.width, gridWidth, cx);

      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let count = 0;
      for (let sy = srcY0; sy < srcY1; sy++) {
        let rowOffset = (sy * source.width + srcX0) * 4;
        for (let sx = srcX0; sx < srcX1; sx++) {
          rSum += source.data[rowOffset] ?? 0;
          gSum += source.data[rowOffset + 1] ?? 0;
          bSum += source.data[rowOffset + 2] ?? 0;
          count++;
          rowOffset += 4;
        }
      }

      cells[cy * gridWidth + cx] = {
        r: Math.round(rSum / count),
        g: Math.round(gSum / count),
        b: Math.round(bSum / count),
      };
    }
  }

  return cells;
}

import type { CropRect, PixelBuffer, RGB } from '../types.js';

function clampCrop(crop: CropRect, sourceWidth: number, sourceHeight: number): CropRect {
  const x = Math.max(0, Math.min(crop.x, sourceWidth - 1));
  const y = Math.max(0, Math.min(crop.y, sourceHeight - 1));
  const width = Math.max(1, Math.min(crop.width, sourceWidth - x));
  const height = Math.max(1, Math.min(crop.height, sourceHeight - y));
  return { x, y, width, height };
}

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
    const srcY0 = crop.y + Math.floor((cy * crop.height) / gridHeight);
    let srcY1 = crop.y + Math.floor(((cy + 1) * crop.height) / gridHeight);
    srcY1 = Math.max(srcY1, srcY0 + 1);
    srcY1 = Math.min(srcY1, crop.y + crop.height);

    for (let cx = 0; cx < gridWidth; cx++) {
      const srcX0 = crop.x + Math.floor((cx * crop.width) / gridWidth);
      let srcX1 = crop.x + Math.floor(((cx + 1) * crop.width) / gridWidth);
      srcX1 = Math.max(srcX1, srcX0 + 1);
      srcX1 = Math.min(srcX1, crop.x + crop.width);

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

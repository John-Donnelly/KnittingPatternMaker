import type { CropRect, PixelBuffer, RGB } from '../types.js';
import { axisBounds, clampCrop } from './cellBounds.js';

/**
 * Per-channel bucket width used to group near-identical colors when finding a cell's dominant
 * color. JPEG compression and anti-aliasing jitter a flat region's pixels by a few levels;
 * bucketing on 16-value boundaries (>> 4) collapses that jitter so those pixels vote together,
 * while genuinely distinct colors (a chart's separate greens, a gray grid line vs. white sky)
 * still land in different buckets. Distinct colors that straddle a bucket boundary may split
 * their vote, but the subsequent palette quantization washes out that rare edge case.
 */
const BUCKET_SHIFT = 4;

interface Bucket {
  count: number;
  rSum: number;
  gSum: number;
  bSum: number;
}

/**
 * Deterministic **dominant-color** (modal) downsample of a crop region of `source` into a
 * `gridWidth` x `gridHeight` grid. Unlike {@link pixelate}, which averages every source pixel
 * in a cell, this picks the *most common* color bucket in the cell and returns the true average
 * of only that bucket's pixels.
 *
 * The point is to recover crisp flat colors from a source that isn't clean pixel art — a photo
 * or JPEG of a chart/logo/pixel-art image, where thin grid lines, anti-aliased edges, and
 * compression ringing are a minority of pixels in each cell. Averaging blends those outliers in
 * (muddy grays, a white sky turning gray); taking the dominant bucket rejects them, so each
 * output cell reads as the flat color that actually fills it.
 *
 * Determinism: pixels are visited in a fixed row-major order, and the winning bucket is chosen
 * by highest count with ties broken by lowest bucket key, so the same input always produces
 * byte-identical output.
 */
export function pixelateDominant(
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

      const buckets = new Map<number, Bucket>();
      for (let sy = srcY0; sy < srcY1; sy++) {
        let rowOffset = (sy * source.width + srcX0) * 4;
        for (let sx = srcX0; sx < srcX1; sx++) {
          const r = source.data[rowOffset] ?? 0;
          const g = source.data[rowOffset + 1] ?? 0;
          const b = source.data[rowOffset + 2] ?? 0;
          const key =
            ((r >> BUCKET_SHIFT) << 16) | ((g >> BUCKET_SHIFT) << 8) | (b >> BUCKET_SHIFT);
          const bucket = buckets.get(key);
          if (bucket) {
            bucket.count++;
            bucket.rSum += r;
            bucket.gSum += g;
            bucket.bSum += b;
          } else {
            buckets.set(key, { count: 1, rSum: r, gSum: g, bSum: b });
          }
          rowOffset += 4;
        }
      }

      let bestKey = Infinity;
      let best: Bucket | undefined;
      for (const [key, bucket] of buckets) {
        if (
          best === undefined ||
          bucket.count > best.count ||
          (bucket.count === best.count && key < bestKey)
        ) {
          best = bucket;
          bestKey = key;
        }
      }

      // best is always defined: every cell covers at least one source pixel (axisBounds).
      const winner = best as Bucket;
      cells[cy * gridWidth + cx] = {
        r: Math.round(winner.rSum / winner.count),
        g: Math.round(winner.gSum / winner.count),
        b: Math.round(winner.bSum / winner.count),
      };
    }
  }

  return cells;
}

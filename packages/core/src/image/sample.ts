import type { CropRect, PixelBuffer, RGB, SamplingMode } from '../types.js';
import { pixelate } from './pixelate.js';
import { pixelateDominant } from './dominantSample.js';

/**
 * Samples a crop region of `source` into a `gridWidth` x `gridHeight` grid of RGB cells using
 * the requested {@link SamplingMode}. Both modes share identical, deterministic cell-boundary
 * math (see `cellBounds.ts`), so they differ only in how each cell's single color is chosen.
 */
export function sampleImage(
  source: PixelBuffer,
  crop: CropRect,
  gridWidth: number,
  gridHeight: number,
  mode: SamplingMode,
): RGB[] {
  return mode === 'dominant'
    ? pixelateDominant(source, crop, gridWidth, gridHeight)
    : pixelate(source, crop, gridWidth, gridHeight);
}

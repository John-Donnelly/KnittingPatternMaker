import type { CropRect } from '../types.js';

export function clampCrop(crop: CropRect, sourceWidth: number, sourceHeight: number): CropRect {
  const x = Math.max(0, Math.min(crop.x, sourceWidth - 1));
  const y = Math.max(0, Math.min(crop.y, sourceHeight - 1));
  const width = Math.max(1, Math.min(crop.width, sourceWidth - x));
  const height = Math.max(1, Math.min(crop.height, sourceHeight - y));
  return { x, y, width, height };
}

/**
 * Half-open source-pixel interval `[start, end)` covered by output cell `index` along one axis,
 * derived purely from integer `Math.floor` math so every sampler that uses it partitions the
 * crop region identically. Guarantees at least one source pixel per cell (nearest-neighbor
 * behavior when upsampling) and never runs past the crop.
 */
export function axisBounds(
  cropStart: number,
  cropLength: number,
  gridCount: number,
  index: number,
): readonly [number, number] {
  const start = cropStart + Math.floor((index * cropLength) / gridCount);
  let end = cropStart + Math.floor(((index + 1) * cropLength) / gridCount);
  end = Math.max(end, start + 1);
  end = Math.min(end, cropStart + cropLength);
  return [start, end];
}

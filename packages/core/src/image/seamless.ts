import type { RGB } from '../types.js';

export interface SeamlessOptions {
  horizontal: boolean;
  vertical: boolean;
}

/**
 * Fraction of the axis length blended on each side of the seam. 0.15 keeps the blend
 * confined to a modest band (~30% of the axis total) so a coarse, low-resolution chart isn't
 * washed out — this is applied to `samples` (already-pixelated grid cells), not the original
 * high-resolution photo, so the band is measured in stitches, not source pixels.
 */
const DEFAULT_BLEND_FRACTION = 0.15;

/** Below this length there isn't meaningful room to blend; the axis is left unchanged. */
const MIN_DIMENSION_FOR_BLEND = 4;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColor(a: RGB, b: RGB, t: number): RGB {
  return { r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) };
}

/**
 * Makes a 1D sequence of colors tile seamlessly with itself using the standard "offset +
 * blend" technique (the same idea as Photoshop's Offset filter + heal-the-seam workflow):
 *
 * 1. Circularly shift the sequence by half its length. The sequence's new edges are now
 *    original *adjacent* samples (they were neighbors at the old center), so they already
 *    match as well as the source content locally does — no work needed there.
 * 2. The discontinuity that used to be at the wrap boundary (last sample next to first) is now
 *    sitting in the middle. Cross-fade across it over a symmetric band so it reads as a smooth
 *    transition instead of a hard edge.
 *
 * This does not guarantee the two new edges are byte-identical — it guarantees they're as
 * continuous as the source image already is at that (formerly central) point, which is the
 * standard, expected behavior of this technique. See docs/KNITTING_NOTES.md.
 */
function makeAxisSeamless(line: readonly RGB[], blendFraction: number): RGB[] {
  const length = line.length;
  if (length < MIN_DIMENSION_FOR_BLEND) {
    return line.slice();
  }

  const shift = Math.floor(length / 2);
  const shifted: RGB[] = new Array(length);
  for (let i = 0; i < length; i++) {
    shifted[i] = line[(i + shift) % length]!;
  }

  // The seam sits between index (seamIndex - 1) and seamIndex.
  const seamIndex = length - shift;
  const maxBand = Math.floor(length / 2) - 1;
  const band = Math.max(0, Math.min(Math.floor(length * blendFraction), maxBand));
  if (band === 0) {
    return shifted;
  }

  const result = shifted.slice();
  for (let k = 1; k <= band; k++) {
    const leftPos = (seamIndex - k + length) % length;
    const rightPos = (seamIndex - 1 + k) % length;
    // Weight on each side's OWN value: small near the seam (mostly blended with the other
    // side), approaching 1 at the far edge of the band (mostly unaltered).
    const weight = k / (band + 1);
    const leftOriginal = shifted[leftPos]!;
    const rightOriginal = shifted[rightPos]!;
    result[leftPos] = lerpColor(rightOriginal, leftOriginal, weight);
    result[rightPos] = lerpColor(leftOriginal, rightOriginal, weight);
  }

  return result;
}

/**
 * Makes a WxH grid of colors tile seamlessly along the requested axes. Applied to `samples`
 * (post-pixelation, pre-quantization) so the blend band is measured in stitches and the
 * resulting quantized chart tiles cleanly. Horizontal is applied row-by-row, then vertical
 * column-by-column on the result (order is a fixed, documented, deterministic choice — it
 * only affects the exact corner blending when both are requested).
 */
export function makeSeamless(
  samples: readonly RGB[],
  width: number,
  height: number,
  options: SeamlessOptions,
  blendFraction = DEFAULT_BLEND_FRACTION,
): RGB[] {
  if (samples.length !== width * height) {
    throw new Error(
      `samples length (${samples.length}) must equal width*height (${width * height})`,
    );
  }
  if (!options.horizontal && !options.vertical) {
    return samples.slice();
  }

  let working: RGB[] = samples.slice();

  if (options.horizontal) {
    const next: RGB[] = new Array(width * height);
    for (let y = 0; y < height; y++) {
      const row = working.slice(y * width, y * width + width);
      const blended = makeAxisSeamless(row, blendFraction);
      for (let x = 0; x < width; x++) {
        next[y * width + x] = blended[x]!;
      }
    }
    working = next;
  }

  if (options.vertical) {
    const next: RGB[] = new Array(width * height);
    for (let x = 0; x < width; x++) {
      const col: RGB[] = new Array(height);
      for (let y = 0; y < height; y++) {
        col[y] = working[y * width + x]!;
      }
      const blended = makeAxisSeamless(col, blendFraction);
      for (let y = 0; y < height; y++) {
        next[y * width + x] = blended[y]!;
      }
    }
    working = next;
  }

  return working.map((c) => ({ r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b) }));
}

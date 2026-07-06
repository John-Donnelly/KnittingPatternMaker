import type { RGB, SeamlessMode } from '../types.js';
import { labDistanceSq, rgbToLab } from '../color/lab.js';

export interface SeamlessOptions {
  horizontal: boolean;
  vertical: boolean;
  /** Cap on the blend band as a fraction of the axis (default 0.25). The pipeline passes a
   * tighter cap when blending is only a fallback for un-quiltable images, where a wide
   * blend reads as a smeared column through discrete chart content. */
  maxBandFraction?: number | undefined;
}

/** Maps a user-facing {@link SeamlessMode} to the per-axis blend flags `makeSeamless` uses. */
export function seamlessModeToOptions(mode: SeamlessMode): SeamlessOptions {
  return {
    horizontal: mode === 'horizontal' || mode === 'both',
    vertical: mode === 'vertical' || mode === 'both',
  };
}

/** Below this length there isn't meaningful room to blend; the axis is left unchanged. */
const MIN_DIMENSION_FOR_BLEND = 4;

/**
 * A wrap-edge jump no worse than this multiple of the line's own average stitch-to-stitch
 * contrast already reads as continuous when tiled, so the line is left completely untouched.
 * This is what lets busy/high-frequency content (checkerboards, noise, dithered areas) tile
 * as-is instead of getting needlessly smoothed.
 */
const CONTINUITY_TOLERANCE = 1.5;

/** Lab-distance units of wrap mismatch absorbed per stitch of blend band on each side of the
 * join — a gentle mismatch gets a 1-2 stitch touch-up, a hard edge gets a wider ramp. */
const LAB_UNITS_PER_BAND_STITCH = 12;

/** Never let the blend band grow past this fraction of the axis, so the visible design always
 * dominates the transition zone. */
const MAX_BAND_FRACTION = 0.25;

function labDistance(a: RGB, b: RGB): number {
  return Math.sqrt(labDistanceSq(rgbToLab(a), rgbToLab(b)));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColor(a: RGB, b: RGB, t: number): RGB {
  return { r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) };
}

function maxBandForLength(length: number, fraction: number = MAX_BAND_FRACTION): number {
  return Math.max(1, Math.min(Math.floor((length - 2) / 2), Math.round(length * fraction)));
}

/**
 * How many stitches of blending (per side of the join) this line needs to tile seamlessly.
 * Measured perceptually (CIE Lab): 0 when the wrap edges already read as continuous relative
 * to the line's own stitch-to-stitch contrast, otherwise proportional to the severity of the
 * jump, capped so the interior always dominates.
 */
function wrapBlendBand(line: readonly RGB[], maxBand: number): number {
  const length = line.length;
  const first = line[0];
  const last = line[length - 1];
  if (!first || !last) return 0;

  const wrapDist = labDistance(last, first);
  if (wrapDist === 0) return 0;

  let adjacentSum = 0;
  for (let i = 1; i < length; i++) {
    adjacentSum += labDistance(line[i - 1]!, line[i]!);
  }
  const meanAdjacent = adjacentSum / (length - 1);
  if (wrapDist <= meanAdjacent * CONTINUITY_TOLERANCE) return 0;

  return Math.max(1, Math.min(maxBand, Math.ceil(wrapDist / LAB_UNITS_PER_BAND_STITCH)));
}

/**
 * Blends a 1D line of colors ACROSS its wrap boundary (last sample adjacent to first when
 * tiled), leaving the interior untouched. A linear "bridge" is drawn between the two anchor
 * samples just outside the blend neighborhood, and each sample in the neighborhood is pulled
 * toward the bridge with a weight that is exactly 1 at the two join-adjacent positions and
 * decays toward 0 at the anchors. Because the join-adjacent samples come purely from the
 * bridge, the residual jump at the tile join is bounded by anchorGap / (2*band + 1) — small
 * for ANY input, not just images that happen to be continuous somewhere.
 */
function blendAcrossWrap(line: readonly RGB[], bandInput: number): RGB[] {
  const length = line.length;
  const band = Math.min(bandInput, Math.floor((length - 2) / 2));
  if (band < 1) return line.slice();

  const out = line.slice();
  const startAnchor = line[length - band - 1]!;
  const endAnchor = line[band]!;
  const neighborhood = 2 * band;

  for (let j = 0; j < neighborhood; j++) {
    const pos = (length - band + j) % length;
    const bridge = lerpColor(startAnchor, endAnchor, (j + 1) / (neighborhood + 1));
    const distFromJoin = j < band ? band - 1 - j : j - band;
    const weight = 1 - distFromJoin / band;
    out[pos] = lerpColor(line[pos]!, bridge, weight);
  }

  return out;
}

/**
 * Applies wrap blending to a set of parallel lines (rows or columns), with each line's band
 * sized independently by its own seam severity and then smoothed across neighboring lines so
 * the transition zone forms a coherent region instead of a ragged per-line comb.
 */
function makeLinesSeamless(lines: readonly (readonly RGB[])[], maxBandFraction?: number): RGB[][] {
  const length = lines[0]?.length ?? 0;
  if (length < MIN_DIMENSION_FOR_BLEND) {
    return lines.map((line) => line.slice());
  }

  const maxBand = maxBandForLength(length, maxBandFraction);
  const bands = lines.map((line) => wrapBlendBand(line, maxBand));
  const smoothed = bands.map((_, i) => {
    const prev = bands[Math.max(0, i - 1)]!;
    const next = bands[Math.min(bands.length - 1, i + 1)]!;
    return Math.round((prev + bands[i]! + next) / 3);
  });

  return lines.map((line, i) =>
    smoothed[i]! > 0 ? blendAcrossWrap(line, smoothed[i]!) : line.slice(),
  );
}

/**
 * Makes a WxH grid of colors tile seamlessly along the requested axes, working on the
 * pixelated stitch grid (pre-quantization) so the blend zone is measured in stitches.
 *
 * Unlike the classic offset+blend technique — which circularly shifts the image and relocates
 * the wrap seam into the MIDDLE of the picture, cross-fading a band right through the subject —
 * this blends across the tile join itself: the interior of the design is untouched, and only
 * an edge band (sized per-line to the actual seam severity, skipped entirely for lines whose
 * edges already read as continuous) is adjusted so opposite edges meet. Horizontal is applied
 * row-by-row, then vertical column-by-column on the result (a fixed, documented, deterministic
 * order; the second pass also reconciles the corners).
 */
export function makeSeamless(
  samples: readonly RGB[],
  width: number,
  height: number,
  options: SeamlessOptions,
): RGB[] {
  if (samples.length !== width * height) {
    throw new Error(
      `samples length (${samples.length}) must equal width*height (${width * height})`,
    );
  }
  if (!options.horizontal && !options.vertical) {
    return samples.slice();
  }

  const working: RGB[] = samples.slice();

  if (options.horizontal && width >= MIN_DIMENSION_FOR_BLEND) {
    const rows: RGB[][] = [];
    for (let y = 0; y < height; y++) {
      rows.push(working.slice(y * width, y * width + width));
    }
    const blended = makeLinesSeamless(rows, options.maxBandFraction);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        working[y * width + x] = blended[y]![x]!;
      }
    }
  }

  if (options.vertical && height >= MIN_DIMENSION_FOR_BLEND) {
    const cols: RGB[][] = [];
    for (let x = 0; x < width; x++) {
      const col: RGB[] = new Array(height);
      for (let y = 0; y < height; y++) {
        col[y] = working[y * width + x]!;
      }
      cols.push(col);
    }
    const blended = makeLinesSeamless(cols, options.maxBandFraction);
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        working[y * width + x] = blended[x]![y]!;
      }
    }
  }

  return working.map((c) => ({ r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b) }));
}

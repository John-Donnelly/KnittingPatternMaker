import type { PixelBuffer, RGB } from '../types.js';
import { pixelate } from '../image/pixelate.js';
import { rgbToLab } from '../color/lab.js';

/**
 * Deterministic summary statistics of a source image, computed on a small probe grid.
 * These drive auto mode's settings choices (see autoSettings.ts); every number here is a
 * pure function of the pixel data, so auto mode stays as deterministic as the rest of core.
 */
export interface ImageStats {
  probeWidth: number;
  probeHeight: number;
  /**
   * Number of coarse color buckets (32 levels per channel) that each cover at least 0.5% of
   * the probe — an estimate of how many *distinct* colors the image is actually made of,
   * robust to JPEG noise and anti-aliasing (which land in sparsely-populated buckets).
   */
  significantColors: number;
  /**
   * Fraction of horizontal/vertical probe-neighbor pairs whose perceptual (Lab) distance is a
   * *soft* transition — clearly visible but not a hard edge. Photos are full of these
   * (gradients, shading, focus falloff); flat-color art is almost entirely "identical" or
   * "hard edge", so its fraction is near zero.
   */
  gradientFraction: number;
  /** Mean Lab chroma (sqrt(a² + b²)) over the probe — near zero for grayscale images. */
  meanChroma: number;
  /** Heuristic: the image reads as flat-color art (logo/chart/pixel art) rather than a photo. */
  isFlatArt: boolean;
  /** Heuristic: the image is effectively grayscale/single-hue. */
  isNearMonochrome: boolean;
}

/** Longest probe-grid side. Big enough to see structure, small enough to stay cheap. */
const PROBE_MAX_DIMENSION = 96;

/** A neighbor-pair Lab distance below this reads as "the same color" (flat region). Probe
 * cells are box-filter averages of many source pixels, which suppresses JPEG/sensor noise well
 * below this, while even a gentle photographic gradient still moves ~1+ Lab per probe step. */
const SOFT_TRANSITION_MIN = 1.0;
/** A neighbor-pair Lab distance above this reads as a hard edge between two distinct colors. */
const SOFT_TRANSITION_MAX = 20;

/** Probe cells a color bucket must cover (as a fraction) to count as a real image color. */
const SIGNIFICANT_BUCKET_SHARE = 0.005;

/** Flat-art classification thresholds (validated against synthetic fixtures in test/). */
const FLAT_ART_MAX_GRADIENT_FRACTION = 0.18;
const FLAT_ART_MAX_SIGNIFICANT_COLORS = 32;

/** Mean chroma below this reads as grayscale/near-monochrome. */
const NEAR_MONOCHROME_MAX_CHROMA = 6;

/**
 * Analyzes a decoded image on a probe grid (longest side {@link PROBE_MAX_DIMENSION}; smaller
 * sources are probed at native size). Deterministic: same pixels, same stats.
 */
export function analyzeImage(source: PixelBuffer): ImageStats {
  const scale = Math.min(1, PROBE_MAX_DIMENSION / Math.max(source.width, source.height));
  const probeWidth = Math.max(1, Math.round(source.width * scale));
  const probeHeight = Math.max(1, Math.round(source.height * scale));

  const probe = pixelate(
    source,
    { x: 0, y: 0, width: source.width, height: source.height },
    probeWidth,
    probeHeight,
  );

  const labs = probe.map((rgb) => rgbToLab(rgb));

  const significantColors = countSignificantColors(probe);
  const gradientFraction = measureGradientFraction(labs, probeWidth, probeHeight);

  let chromaSum = 0;
  for (const lab of labs) {
    chromaSum += Math.sqrt(lab.a * lab.a + lab.b * lab.b);
  }
  const meanChroma = labs.length > 0 ? chromaSum / labs.length : 0;

  return {
    probeWidth,
    probeHeight,
    significantColors,
    gradientFraction,
    meanChroma,
    isFlatArt:
      gradientFraction < FLAT_ART_MAX_GRADIENT_FRACTION &&
      significantColors <= FLAT_ART_MAX_SIGNIFICANT_COLORS,
    isNearMonochrome: meanChroma < NEAR_MONOCHROME_MAX_CHROMA,
  };
}

function countSignificantColors(probe: readonly RGB[]): number {
  const counts = new Map<number, number>();
  for (const { r, g, b } of probe) {
    // 32 levels per channel: quantize to 5 bits and pack into one integer key.
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const threshold = Math.max(1, Math.round(probe.length * SIGNIFICANT_BUCKET_SHARE));
  let significant = 0;
  for (const count of counts.values()) {
    if (count >= threshold) significant++;
  }
  return significant;
}

function measureGradientFraction(
  labs: readonly ReturnType<typeof rgbToLab>[],
  width: number,
  height: number,
): number {
  let pairs = 0;
  let soft = 0;
  const softMinSq = SOFT_TRANSITION_MIN * SOFT_TRANSITION_MIN;
  const softMaxSq = SOFT_TRANSITION_MAX * SOFT_TRANSITION_MAX;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const here = labs[y * width + x];
      if (!here) continue;
      const right = x + 1 < width ? labs[y * width + x + 1] : undefined;
      const down = y + 1 < height ? labs[(y + 1) * width + x] : undefined;
      for (const neighbor of [right, down]) {
        if (!neighbor) continue;
        pairs++;
        const dl = here.l - neighbor.l;
        const da = here.a - neighbor.a;
        const db = here.b - neighbor.b;
        const distSq = dl * dl + da * da + db * db;
        if (distSq > softMinSq && distSq < softMaxSq) soft++;
      }
    }
  }

  return pairs > 0 ? soft / pairs : 0;
}

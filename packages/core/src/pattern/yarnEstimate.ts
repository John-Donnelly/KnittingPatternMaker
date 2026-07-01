import type { GaugeSpec, Grid } from '../types.js';
import { DEFAULT_GAUGE } from '../image/gauge.js';

/**
 * Rough multiplier for stockinette yarn usage per stitch, expressed as a multiple of the
 * stitch's own footprint (width + height at gauge). This is a commonly used ballpark
 * approximation for a first-pass yardage estimate, NOT a precise physical model — actual
 * usage varies with fiber, tension, and finishing. Always buy an extra margin per color.
 */
export const YARDAGE_ROUGH_MULTIPLIER = 4;

export interface ColorYardageEstimate {
  paletteIndex: number;
  stitchCount: number;
  /** Extra length (inches) consumed by floats carried behind the work (stranded technique only). */
  floatInches: number;
  estimatedYards: number;
}

export interface YardageEstimate {
  perColor: ColorYardageEstimate[];
  totalEstimatedYards: number;
}

/**
 * Estimates yarn usage per color from stitch counts and gauge. `floatStitchesByColor` (from
 * `generateStrandedPattern`) adds the extra length spent carrying a color behind the work.
 */
export function estimateYardage(
  grid: Grid,
  gauge: GaugeSpec = DEFAULT_GAUGE,
  floatStitchesByColor?: ReadonlyMap<number, number>,
): YardageEstimate {
  const stitchWidthIn = 4 / gauge.stitchesPer4In;
  const stitchHeightIn = 4 / gauge.rowsPer4In;
  const inchesPerStitch = YARDAGE_ROUGH_MULTIPLIER * (stitchWidthIn + stitchHeightIn);

  const stitchCounts = new Array<number>(grid.palette.length).fill(0);
  for (const idx of grid.indices) {
    stitchCounts[idx] = (stitchCounts[idx] ?? 0) + 1;
  }

  const perColor: ColorYardageEstimate[] = stitchCounts.map((stitchCount, paletteIndex) => {
    const floatStitches = floatStitchesByColor?.get(paletteIndex) ?? 0;
    const floatInches = floatStitches * stitchWidthIn;
    const totalInches = stitchCount * inchesPerStitch + floatInches;
    return { paletteIndex, stitchCount, floatInches, estimatedYards: totalInches / 36 };
  });

  const totalEstimatedYards = perColor.reduce((sum, c) => sum + c.estimatedYards, 0);
  return { perColor, totalEstimatedYards };
}

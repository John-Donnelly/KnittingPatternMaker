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
 * When floats are provided (stranded work, where colors stay attached), each color is also
 * charged for being CARRIED UP the side edge across rows where it isn't knit — between its
 * first and last row of use the yarn still travels one stitch-height per skipped row.
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

  // Edge carries (stranded only): rows between a color's first and last row of use where the
  // color doesn't appear — the yarn is carried up the edge across each of them.
  const skippedRows = new Array<number>(grid.palette.length).fill(0);
  if (floatStitchesByColor) {
    const firstRow = new Array<number>(grid.palette.length).fill(-1);
    const lastRow = new Array<number>(grid.palette.length).fill(-1);
    const rowsUsed = Array.from({ length: grid.palette.length }, () => 0);
    for (let y = 0; y < grid.height; y++) {
      const seen = new Set<number>();
      for (let x = 0; x < grid.width; x++) {
        seen.add(grid.indices[y * grid.width + x] ?? 0);
      }
      for (const idx of seen) {
        if (firstRow[idx] === -1) firstRow[idx] = y;
        lastRow[idx] = y;
        rowsUsed[idx] = (rowsUsed[idx] ?? 0) + 1;
      }
    }
    for (let idx = 0; idx < grid.palette.length; idx++) {
      if (firstRow[idx] === -1) continue;
      const span = (lastRow[idx] ?? 0) - (firstRow[idx] ?? 0) + 1;
      skippedRows[idx] = span - (rowsUsed[idx] ?? 0);
    }
  }

  const perColor: ColorYardageEstimate[] = stitchCounts.map((stitchCount, paletteIndex) => {
    const floatStitches = floatStitchesByColor?.get(paletteIndex) ?? 0;
    const floatInches =
      floatStitches * stitchWidthIn + (skippedRows[paletteIndex] ?? 0) * stitchHeightIn;
    const totalInches = stitchCount * inchesPerStitch + floatInches;
    return { paletteIndex, stitchCount, floatInches, estimatedYards: totalInches / 36 };
  });

  const totalEstimatedYards = perColor.reduce((sum, c) => sum + c.estimatedYards, 0);
  return { perColor, totalEstimatedYards };
}

import type { Grid } from '../types.js';
import { colorworkRowInstruction, type ColorworkRowInstruction } from './colorworkRow.js';
import type { Run } from './runLength.js';

export type { ColorworkRowInstruction };

/** Floats longer than this many stitches should be caught (twisted with the working yarn). */
export const FLOAT_CATCH_THRESHOLD_STITCHES = 5;

/** Stranded (Fair Isle) colorwork is only practical with a small number of colors per row. */
export const STRANDED_RECOMMENDED_MAX_COLORS_PER_ROW = 2;

export interface FloatWarning {
  chartRow: number;
  paletteIndex: number;
  /** Number of stitches the color must be carried behind the work. */
  length: number;
  /** 1-indexed knitting-order stitch positions bounding the float. */
  fromStitch: number;
  toStitch: number;
}

export interface ManyColorRowWarning {
  chartRow: number;
  colorCount: number;
}

export interface StrandedColorworkPattern {
  technique: 'stranded';
  rows: ColorworkRowInstruction[];
  floatWarnings: FloatWarning[];
  manyColorRowWarnings: ManyColorRowWarning[];
  /** Total stitches each color spends carried behind the work (all floats, not just long ones). */
  totalFloatStitchesByColor: Map<number, number>;
}

interface RowFloat {
  paletteIndex: number;
  length: number;
  fromStitch: number;
  toStitch: number;
}

/** Every gap where a color already used in this row is skipped before its next use — i.e.
 * every float, not just the ones long enough to warrant a "catch it" warning. */
function findRowFloats(runs: readonly Run<number>[]): RowFloat[] {
  const floats: RowFloat[] = [];
  const lastEndByColor = new Map<number, number>();
  let cursor = 0;

  for (const run of runs) {
    const startStitch = cursor + 1;
    const endStitch = cursor + run.count;
    const previousEnd = lastEndByColor.get(run.value);
    if (previousEnd !== undefined) {
      const gap = startStitch - previousEnd - 1;
      if (gap > 0) {
        floats.push({
          paletteIndex: run.value,
          length: gap,
          fromStitch: previousEnd,
          toStitch: startStitch,
        });
      }
    }
    lastEndByColor.set(run.value, endStitch);
    cursor = endStitch;
  }

  return floats;
}

/**
 * Generates row-by-row stranded (Fair Isle) colorwork instructions from a quantized grid,
 * plus non-blocking warnings for long floats and rows that exceed the recommended color count.
 * See docs/KNITTING_NOTES.md for the chart-reading/RS-WS conventions this assumes.
 */
export function generateStrandedPattern(grid: Grid): StrandedColorworkPattern {
  const rows: ColorworkRowInstruction[] = [];
  const floatWarnings: FloatWarning[] = [];
  const manyColorRowWarnings: ManyColorRowWarning[] = [];
  const totalFloatStitchesByColor = new Map<number, number>();

  for (let chartRow = 1; chartRow <= grid.height; chartRow++) {
    const instruction = colorworkRowInstruction(grid, chartRow);
    rows.push(instruction);

    for (const float of findRowFloats(instruction.runs)) {
      totalFloatStitchesByColor.set(
        float.paletteIndex,
        (totalFloatStitchesByColor.get(float.paletteIndex) ?? 0) + float.length,
      );
      if (float.length > FLOAT_CATCH_THRESHOLD_STITCHES) {
        floatWarnings.push({ chartRow, ...float });
      }
    }

    const distinctColors = new Set(instruction.runs.map((r) => r.value)).size;
    if (distinctColors > STRANDED_RECOMMENDED_MAX_COLORS_PER_ROW) {
      manyColorRowWarnings.push({ chartRow, colorCount: distinctColors });
    }
  }

  return {
    technique: 'stranded',
    rows,
    floatWarnings,
    manyColorRowWarnings,
    totalFloatStitchesByColor,
  };
}

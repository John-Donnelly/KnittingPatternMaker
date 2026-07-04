import type { DitherMode, Grid, RGB } from '../types.js';
import { linearToSrgbChannel, relativeLuminance } from '../color/lab.js';
import { quantizeGrid } from '../image/quantizeGrid.js';
import { chartRowToGridRow, isRightSideRow, toKnittingOrder } from './chartOrder.js';
import { runLengthEncode, type Run } from './runLength.js';

export type Stitch = 'K' | 'P';

export interface TextureRowInstruction {
  chartRow: number;
  side: 'RS' | 'WS';
  runs: Run<Stitch>[];
  text: string;
}

export interface TexturePattern {
  technique: 'texture';
  grid: Grid;
  rows: TextureRowInstruction[];
}

/**
 * Converts RGB samples to grayscale using relative luminance, RE-ENCODED to gamma sRGB.
 * The luminance itself is computed in linear light (perceptually correct weighting of
 * R/G/B), but the resulting gray must be written back as a gamma-encoded channel value:
 * everything downstream (Lab conversion, dithering, palette refinement) interprets channel
 * values as sRGB. Storing the linear value directly double-decodes the gamma — a mid-gray
 * (Y = 0.5) would be read as sRGB 128 -> linear 0.216, skewing every texture chart dark and
 * misplacing the two-tone split.
 */
function toGrayscaleSamples(samples: readonly RGB[]): RGB[] {
  return samples.map((s) => {
    const l = Math.round(linearToSrgbChannel(relativeLuminance(s)) * 255);
    return { r: l, g: l, b: l };
  });
}

/**
 * Quantizes an image down to (at most) two tones for a single-color knit/purl texture chart.
 * Reuses the same deterministic median-cut + dither pipeline as color techniques, applied to
 * grayscale samples, so behavior (and determinism guarantees) stay consistent across the app.
 *
 * Wool-shade merging is explicitly DISABLED here: the whole point of the texture chart is a
 * two-tone split, and the default delta-E 10 merge can collapse two legitimately distinct
 * grays into one — which flattens the entire motif into plain stockinette.
 */
export function quantizeTexture(
  samples: readonly RGB[],
  width: number,
  height: number,
  dither: DitherMode,
): Grid {
  return quantizeGrid(toGrayscaleSamples(samples), width, height, {
    maxColors: 2,
    dither,
    shadeMergeDeltaE: 0,
  });
}

/**
 * Relies on `medianCutPalette` always returning its palette sorted darkest-to-lightest (see
 * `color/quantize.ts`), so index 0 is guaranteed to be the darkest color whenever there's more
 * than one. If that sort order ever changes, this — and every texture pattern's K/P
 * assignment — silently inverts, so `medianCutPalette`'s "orders darkest to lightest" contract
 * (asserted by `quantize.test.ts`'s ordering test) must hold.
 */
function isDarkIndex(paletteIndex: number, paletteLength: number): boolean {
  return paletteLength > 1 && paletteIndex === 0;
}

/**
 * Which stitch to work so that `isDark` cells show as a purl bump (raised relief) and light
 * cells show as a plain knit "V" when viewed from the right side. On WS rows the stitch is
 * inverted from its RS appearance, because a knit worked on the WS reads as a purl bump on
 * the RS and vice versa. See docs/KNITTING_NOTES.md.
 */
function stitchFor(isDark: boolean, isRightSide: boolean): Stitch {
  if (isDark) return isRightSide ? 'P' : 'K';
  return isRightSide ? 'K' : 'P';
}

function rowText(chartRow: number, side: 'RS' | 'WS', runs: readonly Run<Stitch>[]): string {
  const body = runs.map((run) => `${run.value}${run.count}`).join(', ');
  return `Row ${chartRow} (${side}): ${body}`;
}

/**
 * Generates row-by-row knit/purl texture (relief) instructions from a 2-tone quantized grid.
 */
export function generateTexturePattern(grid: Grid): TexturePattern {
  const rows: TextureRowInstruction[] = [];

  for (let chartRow = 1; chartRow <= grid.height; chartRow++) {
    const side = isRightSideRow(chartRow) ? 'RS' : 'WS';
    const gridRow = chartRowToGridRow(chartRow, grid.height);
    const start = gridRow * grid.width;
    const imageOrderRow = Array.from(grid.indices.slice(start, start + grid.width));
    const knittingOrderRow = toKnittingOrder(imageOrderRow, chartRow);

    const stitches = knittingOrderRow.map((paletteIndex) =>
      stitchFor(isDarkIndex(paletteIndex, grid.palette.length), side === 'RS'),
    );
    const runs = runLengthEncode(stitches);
    rows.push({ chartRow, side, runs, text: rowText(chartRow, side, runs) });
  }

  return { technique: 'texture', grid, rows };
}

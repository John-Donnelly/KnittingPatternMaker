import type { Grid } from '../types.js';

/**
 * Repeats (tiles) a quantized `grid` `across` times horizontally and `down` times vertically,
 * producing a new grid of size `(width*across) x (height*down)` that reuses the same palette.
 * This is the step that actually *materializes* a repeated pattern in the chart: the source
 * motif is laid down side-by-side / stacked, cell for cell.
 *
 * Tiling operates on the already-quantized index grid (not the RGB samples), so every copy is
 * byte-identical and no re-quantization drift can creep in between tiles. Deterministic and
 * pure. Pair with `makeSeamless` (applied to the motif *before* quantization) so the tile
 * edges match and the repeat loops without a visible seam.
 */
export function tileGrid(grid: Grid, across: number, down: number): Grid {
  if (!Number.isInteger(across) || !Number.isInteger(down) || across < 1 || down < 1) {
    throw new Error(`tile counts must be positive integers, got ${across}x${down}`);
  }
  if (across === 1 && down === 1) {
    return { ...grid, indices: grid.indices.slice() };
  }

  const { width, height, indices, palette } = grid;
  const newWidth = width * across;
  const newHeight = height * down;
  const tiled = new Uint16Array(newWidth * newHeight);

  for (let y = 0; y < newHeight; y++) {
    const srcRow = (y % height) * width;
    const destRow = y * newWidth;
    for (let x = 0; x < newWidth; x++) {
      tiled[destRow + x] = indices[srcRow + (x % width)] ?? 0;
    }
  }

  return { width: newWidth, height: newHeight, indices: tiled, palette };
}

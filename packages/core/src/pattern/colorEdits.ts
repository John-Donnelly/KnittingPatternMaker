import type { Grid, RGB } from '../types.js';
import { nearestColorIndex } from '../color/nearest.js';

/**
 * Per-palette-color edits applied to a generated grid: substitute a color everywhere, or
 * turn it OFF — its stitches are reassigned to the perceptually nearest remaining color and
 * the entry is dropped from the palette. Pure and deterministic, so the edited grid feeds
 * straight back into the same pattern/yardage/share/export functions.
 */
export interface ColorEdit {
  /** false = remove this color; its stitches merge into the nearest enabled color. */
  enabled: boolean;
  /** Replacement color (applies whether or not other colors reference it). */
  override?: RGB | undefined;
}

/** True when the edits leave the grid unchanged (all enabled, no overrides). */
export function isIdentityEdits(edits: readonly ColorEdit[]): boolean {
  return edits.every((e) => e.enabled && !e.override);
}

/**
 * Removes isolated single stitches: any cell whose 4-neighbors all differ from it is
 * replaced by its most common neighbor color (ties break toward the lowest palette index).
 * Single stitches are fiddly to knit in colorwork, and sources converted from images often
 * contain stray ones — this is the standard manual chart cleanup, automated. All
 * replacements are computed against the INPUT state and applied at once, so the result is
 * deterministic and independent of scan order. Unused palette entries are kept (indices
 * stay stable for the color-edit UI).
 */
export function despeckleGrid(grid: Grid): Grid {
  const { width, height } = grid;
  const indices = new Uint16Array(grid.indices);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const self = grid.indices[y * width + x] ?? 0;
      const neighbors: number[] = [];
      if (x > 0) neighbors.push(grid.indices[y * width + x - 1] ?? 0);
      if (x < width - 1) neighbors.push(grid.indices[y * width + x + 1] ?? 0);
      if (y > 0) neighbors.push(grid.indices[(y - 1) * width + x] ?? 0);
      if (y < height - 1) neighbors.push(grid.indices[(y + 1) * width + x] ?? 0);
      // A cell with fewer than 3 neighbors (corners, 1-row/1-column charts) can't reliably
      // be called a speckle — leave it alone.
      if (neighbors.length < 3 || neighbors.some((n) => n === self)) continue;
      const counts = new Map<number, number>();
      for (const n of neighbors) counts.set(n, (counts.get(n) ?? 0) + 1);
      let best = neighbors[0] ?? 0;
      let bestCount = 0;
      for (const [idx, count] of counts) {
        if (count > bestCount || (count === bestCount && idx < best)) {
          best = idx;
          bestCount = count;
        }
      }
      indices[y * width + x] = best;
    }
  }
  return { width, height, indices, palette: grid.palette.slice() };
}

export function applyColorEdits(grid: Grid, edits: readonly ColorEdit[]): Grid {
  if (edits.length !== grid.palette.length) {
    throw new Error(`edits length ${edits.length} != palette length ${grid.palette.length}`);
  }

  const edited: RGB[] = grid.palette.map((color, i) => edits[i]?.override ?? color);
  let enabledIndices = edits.flatMap((e, i) => (e.enabled ? [i] : []));
  // Disabling everything is meaningless for a chart — treat as all-enabled instead of
  // producing an empty palette.
  if (enabledIndices.length === 0) enabledIndices = edits.map((_, i) => i);

  const enabledPalette = enabledIndices.map((i) => edited[i] ?? { r: 0, g: 0, b: 0 });

  // Old palette index -> position within the enabled palette.
  const remap = new Map<number, number>();
  enabledIndices.forEach((oldIndex, pos) => remap.set(oldIndex, pos));

  const indices = new Uint16Array(grid.indices.length);
  for (let i = 0; i < grid.indices.length; i++) {
    const oldIndex = grid.indices[i] ?? 0;
    const mapped = remap.get(oldIndex);
    indices[i] =
      mapped !== undefined
        ? mapped
        : // Disabled color: merge into the perceptually nearest enabled color.
          nearestColorIndex(edited[oldIndex] ?? { r: 0, g: 0, b: 0 }, enabledPalette);
  }

  return { width: grid.width, height: grid.height, indices, palette: enabledPalette };
}

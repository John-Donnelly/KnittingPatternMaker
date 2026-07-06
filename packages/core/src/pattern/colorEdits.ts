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

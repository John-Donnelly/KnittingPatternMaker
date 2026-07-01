/** Stable, 1-indexed color labels (C1, C2, ...) used consistently across instructions, the
 * chart legend, and exports. */
export function paletteLabel(paletteIndex: number): string {
  return `C${paletteIndex + 1}`;
}

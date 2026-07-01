/**
 * Chart <-> knitting-order conventions, documented explicitly since they encode assumptions
 * about how the pattern will be worked (see docs/KNITTING_NOTES.md):
 *
 * - Flat knitting, worked bottom-up: chart row 1 is the FIRST row worked and sits at the
 *   BOTTOM of the picture; the last chart row is worked last and sits at the TOP. Our pixel
 *   `Grid` is stored top-to-bottom (row 0 = top of the image), so chart row `r` (1-indexed)
 *   maps to grid row `height - r`.
 * - Odd chart rows are RS (right side facing), even rows are WS. Charts are drawn as the
 *   fabric appears from the RS, so RS rows are read right-to-left and WS rows left-to-right.
 */

export function chartRowToGridRow(chartRow: number, height: number): number {
  return height - chartRow;
}

export function isRightSideRow(chartRow: number): boolean {
  return chartRow % 2 === 1;
}

/**
 * Returns one grid row's values in knitting order (stitch 1 first), given a row of values in
 * image order (index 0 = leftmost column of the picture).
 */
export function toKnittingOrder<T>(imageOrderRow: readonly T[], chartRow: number): T[] {
  return isRightSideRow(chartRow) ? imageOrderRow.slice().reverse() : imageOrderRow.slice();
}

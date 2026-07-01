import type { Grid } from '../types.js';
import { chartRowToGridRow, isRightSideRow, toKnittingOrder } from './chartOrder.js';
import { runLengthEncode, type Run } from './runLength.js';
import { paletteLabel } from './paletteLabels.js';

/** A single chart row's color runs, shared shape used by both stranded and intarsia output. */
export interface ColorworkRowInstruction {
  chartRow: number;
  side: 'RS' | 'WS';
  runs: Run<number>[];
  text: string;
}

export function colorworkRowRuns(grid: Grid, chartRow: number): Run<number>[] {
  const gridRow = chartRowToGridRow(chartRow, grid.height);
  const start = gridRow * grid.width;
  const imageOrderRow = Array.from(grid.indices.slice(start, start + grid.width));
  const knittingOrderRow = toKnittingOrder(imageOrderRow, chartRow);
  return runLengthEncode(knittingOrderRow);
}

export function colorworkRowInstruction(grid: Grid, chartRow: number): ColorworkRowInstruction {
  const side = isRightSideRow(chartRow) ? 'RS' : 'WS';
  const runs = colorworkRowRuns(grid, chartRow);
  const text = `Row ${chartRow} (${side}): ${runs.map((r) => `K${r.count} ${paletteLabel(r.value)}`).join(', ')}`;
  return { chartRow, side, runs, text };
}

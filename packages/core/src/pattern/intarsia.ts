import type { Grid } from '../types.js';
import { colorworkRowInstruction, type ColorworkRowInstruction } from './colorworkRow.js';

export type { ColorworkRowInstruction };

/** A maximal 4-connected region of a single color: one bobbin is needed per block. */
export interface IntarsiaBlock {
  id: number;
  paletteIndex: number;
  /** Number of stitches (cells) in this block. */
  size: number;
  /** Grid-row-major bounding box, in grid coordinates (row 0 = top of image). */
  boundingBox: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface IntarsiaPattern {
  technique: 'intarsia';
  rows: ColorworkRowInstruction[];
  blocks: IntarsiaBlock[];
  /** Total distinct bobbins required across the whole piece (== blocks.length). */
  bobbinCount: number;
}

/**
 * Finds maximal 4-connected same-color regions (flood fill). The result set of regions is
 * independent of traversal order, so this is deterministic regardless of scan direction;
 * we scan row-major purely for a stable `id` assignment order.
 */
function findBlocks(grid: Grid): IntarsiaBlock[] {
  const { width, height, indices } = grid;
  const visited = new Uint8Array(width * height);
  const blocks: IntarsiaBlock[] = [];
  let nextId = 0;

  for (let startY = 0; startY < height; startY++) {
    for (let startX = 0; startX < width; startX++) {
      const startCell = startY * width + startX;
      if (visited[startCell]) continue;

      const paletteIndex = indices[startCell] ?? 0;
      const stack: number[] = [startCell];
      visited[startCell] = 1;
      let size = 0;
      let minX = startX;
      let maxX = startX;
      let minY = startY;
      let maxY = startY;

      while (stack.length > 0) {
        const cell = stack.pop();
        if (cell === undefined) continue;
        size++;
        const x = cell % width;
        const y = (cell - x) / width;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;

        const neighbors = [
          x > 0 ? cell - 1 : -1,
          x < width - 1 ? cell + 1 : -1,
          y > 0 ? cell - width : -1,
          y < height - 1 ? cell + width : -1,
        ];
        for (const n of neighbors) {
          if (n < 0 || visited[n]) continue;
          if (indices[n] !== paletteIndex) continue;
          visited[n] = 1;
          stack.push(n);
        }
      }

      blocks.push({
        id: nextId++,
        paletteIndex,
        size,
        boundingBox: { minX, minY, maxX, maxY },
      });
    }
  }

  return blocks;
}

/**
 * Generates row-by-row intarsia instructions (one bobbin per color block, no floats) plus
 * a connected-region block breakdown estimating how many bobbins to prepare.
 */
export function generateIntarsiaPattern(grid: Grid): IntarsiaPattern {
  const rows: ColorworkRowInstruction[] = [];
  for (let chartRow = 1; chartRow <= grid.height; chartRow++) {
    rows.push(colorworkRowInstruction(grid, chartRow));
  }

  const blocks = findBlocks(grid);

  return { technique: 'intarsia', rows, blocks, bobbinCount: blocks.length };
}

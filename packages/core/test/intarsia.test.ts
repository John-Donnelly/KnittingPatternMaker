import { describe, expect, it } from 'vitest';
import { generateIntarsiaPattern } from '../src/pattern/intarsia.js';
import type { Grid } from '../src/types.js';

const A = { r: 0, g: 0, b: 0 };
const B = { r: 255, g: 255, b: 255 };

describe('generateIntarsiaPattern', () => {
  it('counts two disconnected same-color regions as two separate bobbins', () => {
    // 4x2 grid:
    // row0: A B B A
    // row1: A B B A
    const grid: Grid = {
      width: 4,
      height: 2,
      indices: Uint16Array.from([0, 1, 1, 0, 0, 1, 1, 0]),
      palette: [A, B],
    };

    const pattern = generateIntarsiaPattern(grid);
    // Two color-0 columns (not 4-connected to each other) + one color-1 block = 3 bobbins.
    expect(pattern.bobbinCount).toBe(3);
    expect(pattern.blocks).toHaveLength(3);

    const colorZeroBlocks = pattern.blocks.filter((b) => b.paletteIndex === 0);
    const colorOneBlocks = pattern.blocks.filter((b) => b.paletteIndex === 1);
    expect(colorZeroBlocks).toHaveLength(2);
    expect(colorOneBlocks).toHaveLength(1);
    expect(colorZeroBlocks.every((b) => b.size === 2)).toBe(true);
    expect(colorOneBlocks[0]?.size).toBe(4);
  });

  it('treats a single connected region as one bobbin', () => {
    const grid: Grid = {
      width: 3,
      height: 3,
      indices: Uint16Array.from(new Array(9).fill(0)),
      palette: [A],
    };
    const pattern = generateIntarsiaPattern(grid);
    expect(pattern.bobbinCount).toBe(1);
    expect(pattern.blocks[0]).toMatchObject({
      paletteIndex: 0,
      size: 9,
      boundingBox: { minX: 0, minY: 0, maxX: 2, maxY: 2 },
    });
  });

  it('generates the same row instruction format as stranded colorwork', () => {
    const grid: Grid = {
      width: 4,
      height: 1,
      indices: Uint16Array.from([0, 0, 1, 1]),
      palette: [A, B],
    };
    const pattern = generateIntarsiaPattern(grid);
    // width=4, height=1 -> chart row 1 is RS, read right-to-left: [1,1,0,0]
    expect(pattern.rows[0]?.text).toBe('Row 1 (RS): K2 C2, K2 C1');
  });

  it('is deterministic across repeated calls', () => {
    const indices = Uint16Array.from(Array.from({ length: 20 * 15 }, (_, i) => (i * 3 + 1) % 4));
    const grid: Grid = { width: 20, height: 15, indices, palette: [A, B, A, B] };
    const first = generateIntarsiaPattern(grid);
    const second = generateIntarsiaPattern(grid);
    expect(first.bobbinCount).toBe(second.bobbinCount);
    expect(first.blocks).toEqual(second.blocks);
    expect(first.rows.map((r) => r.text)).toEqual(second.rows.map((r) => r.text));
  });
});

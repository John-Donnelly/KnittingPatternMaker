import { describe, expect, it } from 'vitest';
import { generateStrandedPattern } from '../src/pattern/strandedColorwork.js';
import type { Grid } from '../src/types.js';

const DARK = { r: 0, g: 0, b: 0 };
const LIGHT = { r: 255, g: 255, b: 255 };

describe('generateStrandedPattern', () => {
  it('reads RS rows right-to-left and WS rows left-to-right, bottom row first', () => {
    // width=4, height=3. Rows below are in IMAGE order (top to bottom, left to right).
    const grid: Grid = {
      width: 4,
      height: 3,
      indices: Uint16Array.from([
        0,
        0,
        0,
        0, // top (image row 0)
        0,
        1,
        0,
        1, // middle (image row 1)
        1,
        0,
        0,
        0, // bottom (image row 2)
      ]),
      palette: [DARK, LIGHT],
    };

    const pattern = generateStrandedPattern(grid);
    expect(pattern.rows).toHaveLength(3);

    // Chart row 1 = bottom image row, RS, read right-to-left: [1,0,0,0] -> [0,0,0,1]
    expect(pattern.rows[0]).toMatchObject({ chartRow: 1, side: 'RS' });
    expect(pattern.rows[0]?.text).toBe('Row 1 (RS): K3 C1, K1 C2');

    // Chart row 2 = middle image row, WS, read left-to-right: [0,1,0,1].
    // WS rows of flat stockinette colorwork are PURLED — the stitch letter must say so.
    expect(pattern.rows[1]).toMatchObject({ chartRow: 2, side: 'WS' });
    expect(pattern.rows[1]?.text).toBe('Row 2 (WS): P1 C1, P1 C2, P1 C1, P1 C2');

    // Chart row 3 = top image row, RS, uniform row
    expect(pattern.rows[2]).toMatchObject({ chartRow: 3, side: 'RS' });
    expect(pattern.rows[2]?.text).toBe('Row 3 (RS): K4 C1');
  });

  it('flags a float longer than the catch threshold', () => {
    const grid: Grid = {
      width: 10,
      height: 1,
      indices: Uint16Array.from([1, 0, 0, 0, 0, 0, 0, 0, 0, 1]),
      palette: [DARK, LIGHT],
    };

    const pattern = generateStrandedPattern(grid);
    expect(pattern.floatWarnings).toHaveLength(1);
    expect(pattern.floatWarnings[0]).toEqual({
      chartRow: 1,
      paletteIndex: 1,
      length: 8,
      fromStitch: 1,
      toStitch: 10,
    });
    expect(pattern.totalFloatStitchesByColor.get(1)).toBe(8);
  });

  it('does not flag a short float at or below the threshold', () => {
    // Gap of exactly 5 stitches: [1, 0,0,0,0,0, 1] (width 7)
    const grid: Grid = {
      width: 7,
      height: 1,
      indices: Uint16Array.from([1, 0, 0, 0, 0, 0, 1]),
      palette: [DARK, LIGHT],
    };
    const pattern = generateStrandedPattern(grid);
    expect(pattern.floatWarnings).toHaveLength(0);
    expect(pattern.totalFloatStitchesByColor.get(1)).toBe(5);
  });

  it('warns when a row uses more than the recommended color count', () => {
    const grid: Grid = {
      width: 6,
      height: 1,
      indices: Uint16Array.from([0, 1, 2, 0, 1, 2]),
      palette: [DARK, { r: 128, g: 128, b: 128 }, LIGHT],
    };
    const pattern = generateStrandedPattern(grid);
    expect(pattern.manyColorRowWarnings).toEqual([{ chartRow: 1, colorCount: 3 }]);
  });

  it('is deterministic across repeated calls', () => {
    const grid: Grid = {
      width: 12,
      height: 8,
      indices: Uint16Array.from(Array.from({ length: 96 }, (_, i) => (i * 7 + (i % 5)) % 3)),
      palette: [DARK, { r: 128, g: 128, b: 128 }, LIGHT],
    };
    const a = generateStrandedPattern(grid);
    const b = generateStrandedPattern(grid);
    expect(a.rows.map((r) => r.text)).toEqual(b.rows.map((r) => r.text));
    expect(a.floatWarnings).toEqual(b.floatWarnings);
    expect(Array.from(a.totalFloatStitchesByColor.entries())).toEqual(
      Array.from(b.totalFloatStitchesByColor.entries()),
    );
  });
});

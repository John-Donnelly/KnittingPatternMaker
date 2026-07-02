import { describe, expect, it } from 'vitest';
import { tileGrid } from '../src/image/tileGrid.js';
import { seamlessModeToOptions } from '../src/image/seamless.js';
import type { Grid } from '../src/types.js';

const A = { r: 0, g: 0, b: 0 };
const B = { r: 255, g: 255, b: 255 };

function grid2x2(): Grid {
  // 2x2:  0 1
  //       2 3  (using a 4-color palette so each cell is distinguishable)
  return {
    width: 2,
    height: 2,
    indices: Uint16Array.from([0, 1, 2, 3]),
    palette: [A, B, A, B],
  };
}

describe('tileGrid', () => {
  it('returns a copy (not the same array) for 1x1', () => {
    const g = grid2x2();
    const t = tileGrid(g, 1, 1);
    expect(Array.from(t.indices)).toEqual([0, 1, 2, 3]);
    expect(t.indices).not.toBe(g.indices);
  });

  it('repeats horizontally', () => {
    const t = tileGrid(grid2x2(), 3, 1);
    expect(t.width).toBe(6);
    expect(t.height).toBe(2);
    // Row 0: [0 1] [0 1] [0 1]; Row 1: [2 3] [2 3] [2 3]
    expect(Array.from(t.indices)).toEqual([0, 1, 0, 1, 0, 1, 2, 3, 2, 3, 2, 3]);
  });

  it('repeats vertically', () => {
    const t = tileGrid(grid2x2(), 1, 3);
    expect(t.width).toBe(2);
    expect(t.height).toBe(6);
    expect(Array.from(t.indices)).toEqual([0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3]);
  });

  it('repeats both axes', () => {
    const t = tileGrid(grid2x2(), 2, 2);
    expect(t.width).toBe(4);
    expect(t.height).toBe(4);
    // Two rows of [0 1 0 1], two rows of [2 3 2 3]
    expect(Array.from(t.indices)).toEqual([0, 1, 0, 1, 2, 3, 2, 3, 0, 1, 0, 1, 2, 3, 2, 3]);
  });

  it('shares the palette and keeps every index in range', () => {
    const g = grid2x2();
    const t = tileGrid(g, 4, 3);
    expect(t.palette).toBe(g.palette);
    for (const idx of t.indices) expect(idx).toBeLessThan(t.palette.length);
  });

  it('throws for non-positive or non-integer counts', () => {
    expect(() => tileGrid(grid2x2(), 0, 1)).toThrow();
    expect(() => tileGrid(grid2x2(), 1, -2)).toThrow();
    expect(() => tileGrid(grid2x2(), 1.5, 1)).toThrow();
  });

  it('is deterministic', () => {
    const g = grid2x2();
    expect(Array.from(tileGrid(g, 3, 3).indices)).toEqual(Array.from(tileGrid(g, 3, 3).indices));
  });
});

describe('seamlessModeToOptions', () => {
  it('maps each mode to the right axes', () => {
    expect(seamlessModeToOptions('none')).toEqual({ horizontal: false, vertical: false });
    expect(seamlessModeToOptions('horizontal')).toEqual({ horizontal: true, vertical: false });
    expect(seamlessModeToOptions('vertical')).toEqual({ horizontal: false, vertical: true });
    expect(seamlessModeToOptions('both')).toEqual({ horizontal: true, vertical: true });
  });
});

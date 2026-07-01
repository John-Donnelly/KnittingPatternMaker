import { describe, expect, it } from 'vitest';
import { estimateYardage } from '../src/pattern/yarnEstimate.js';
import type { Grid } from '../src/types.js';

const COLOR = { r: 100, g: 100, b: 100 };

describe('estimateYardage', () => {
  it('computes yardage from stitch count and gauge', () => {
    const grid: Grid = {
      width: 10,
      height: 1,
      indices: Uint16Array.from(new Array(10).fill(0)),
      palette: [COLOR],
    };
    const estimate = estimateYardage(grid, { stitchesPer4In: 20, rowsPer4In: 20 });
    // stitchWidthIn = stitchHeightIn = 0.2in; inchesPerStitch = 4*(0.2+0.2) = 1.6in
    // 10 stitches * 1.6in = 16in = 16/36 yards
    expect(estimate.perColor).toHaveLength(1);
    expect(estimate.perColor[0]?.stitchCount).toBe(10);
    expect(estimate.perColor[0]?.floatInches).toBe(0);
    expect(estimate.perColor[0]?.estimatedYards).toBeCloseTo(16 / 36, 6);
    expect(estimate.totalEstimatedYards).toBeCloseTo(16 / 36, 6);
  });

  it('adds float length converted to inches for the carried color', () => {
    const grid: Grid = {
      width: 10,
      height: 1,
      indices: Uint16Array.from(new Array(10).fill(0)),
      palette: [COLOR],
    };
    const floatStitches = new Map([[0, 8]]);
    const estimate = estimateYardage(grid, { stitchesPer4In: 20, rowsPer4In: 20 }, floatStitches);
    // float: 8 stitches * 0.2in/stitch = 1.6in extra
    expect(estimate.perColor[0]?.floatInches).toBeCloseTo(1.6, 6);
    expect(estimate.perColor[0]?.estimatedYards).toBeCloseTo((16 + 1.6) / 36, 6);
  });

  it('splits yardage across multiple colors by stitch count', () => {
    const grid: Grid = {
      width: 4,
      height: 1,
      indices: Uint16Array.from([0, 0, 0, 1]),
      palette: [COLOR, COLOR],
    };
    const estimate = estimateYardage(grid, { stitchesPer4In: 20, rowsPer4In: 20 });
    expect(estimate.perColor[0]?.stitchCount).toBe(3);
    expect(estimate.perColor[1]?.stitchCount).toBe(1);
  });

  it('uses the default gauge when none is provided', () => {
    const grid: Grid = {
      width: 5,
      height: 1,
      indices: Uint16Array.from(new Array(5).fill(0)),
      palette: [COLOR],
    };
    expect(() => estimateYardage(grid)).not.toThrow();
  });

  it('is deterministic', () => {
    const grid: Grid = {
      width: 20,
      height: 15,
      indices: Uint16Array.from(Array.from({ length: 300 }, (_, i) => i % 3)),
      palette: [COLOR, COLOR, COLOR],
    };
    const a = estimateYardage(grid, { stitchesPer4In: 22, rowsPer4In: 30 });
    const b = estimateYardage(grid, { stitchesPer4In: 22, rowsPer4In: 30 });
    expect(a).toEqual(b);
  });
});

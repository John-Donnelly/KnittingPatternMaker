import { describe, expect, it } from 'vitest';
import { buildPatternResult, buildYardageEstimate } from '../src/pattern/patternResult.js';
import type { Grid } from '../src/types.js';

const A = { r: 0, g: 0, b: 0 };
const B = { r: 255, g: 255, b: 255 };

function twoColorGrid(): Grid {
  return {
    width: 10,
    height: 1,
    indices: Uint16Array.from([1, 0, 0, 0, 0, 0, 0, 0, 0, 1]),
    palette: [A, B],
  };
}

describe('buildPatternResult', () => {
  it('produces a JSON-safe stranded result with float warnings', () => {
    const result = buildPatternResult('stranded', twoColorGrid());
    expect(result.technique).toBe('stranded');
    if (result.technique !== 'stranded') throw new Error('unreachable');
    expect(result.floatWarnings).toHaveLength(1);
    // totalFloatStitchesByColor must be a plain array of entries, not a Map, so it survives JSON.
    expect(Array.isArray(result.totalFloatStitchesByColor)).toBe(true);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('produces a JSON-safe intarsia result with a bobbin count', () => {
    const result = buildPatternResult('intarsia', twoColorGrid());
    expect(result.technique).toBe('intarsia');
    if (result.technique !== 'intarsia') throw new Error('unreachable');
    expect(result.bobbinCount).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('produces a JSON-safe texture result', () => {
    const result = buildPatternResult('texture', twoColorGrid());
    expect(result.technique).toBe('texture');
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('is deterministic', () => {
    const grid = twoColorGrid();
    const a = buildPatternResult('stranded', grid);
    const b = buildPatternResult('stranded', grid);
    expect(a).toEqual(b);
  });
});

describe('buildYardageEstimate', () => {
  it('folds stranded float stitches into the yardage estimate', () => {
    const grid = twoColorGrid();
    const pattern = buildPatternResult('stranded', grid);
    const withFloats = buildYardageEstimate(grid, { stitchesPer4In: 20, rowsPer4In: 20 }, pattern);
    const withoutFloats = buildYardageEstimate(
      grid,
      { stitchesPer4In: 20, rowsPer4In: 20 },
      { technique: 'texture', rows: [] },
    );
    const colorWithFloat = withFloats.perColor.find((c) => c.paletteIndex === 1);
    expect(colorWithFloat?.floatInches).toBeGreaterThan(0);
    expect(withFloats.totalEstimatedYards).toBeGreaterThan(withoutFloats.totalEstimatedYards);
  });

  it('does not add float length for non-stranded techniques', () => {
    const grid = twoColorGrid();
    const pattern = buildPatternResult('intarsia', grid);
    const estimate = buildYardageEstimate(grid, undefined, pattern);
    expect(estimate.perColor.every((c) => c.floatInches === 0)).toBe(true);
  });
});

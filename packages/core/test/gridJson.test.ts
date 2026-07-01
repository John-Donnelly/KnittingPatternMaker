import { describe, expect, it } from 'vitest';
import { deserializeGrid, serializeGrid, serializeNumberMap } from '../src/pattern/gridJson.js';
import type { Grid } from '../src/types.js';

describe('serializeGrid / deserializeGrid', () => {
  it('round-trips a grid through JSON-safe form', () => {
    const grid: Grid = {
      width: 3,
      height: 2,
      indices: Uint16Array.from([0, 1, 2, 1, 0, 2]),
      palette: [
        { r: 1, g: 2, b: 3 },
        { r: 4, g: 5, b: 6 },
        { r: 7, g: 8, b: 9 },
      ],
    };

    const json = serializeGrid(grid);
    expect(json.indices).toEqual([0, 1, 2, 1, 0, 2]);
    expect(Array.isArray(json.indices)).toBe(true);

    const restored = deserializeGrid(json);
    expect(restored.width).toBe(grid.width);
    expect(restored.height).toBe(grid.height);
    expect(Array.from(restored.indices)).toEqual(Array.from(grid.indices));
    expect(restored.palette).toEqual(grid.palette);
  });

  it('is JSON.stringify-safe (no typed arrays or Maps at the top level)', () => {
    const grid: Grid = {
      width: 2,
      height: 1,
      indices: Uint16Array.from([0, 1]),
      palette: [
        { r: 0, g: 0, b: 0 },
        { r: 255, g: 255, b: 255 },
      ],
    };
    const json = serializeGrid(grid);
    const roundTripped = JSON.parse(JSON.stringify(json));
    expect(roundTripped).toEqual(json);
  });
});

describe('serializeNumberMap', () => {
  it('converts a Map to an array of entries, preserving insertion order', () => {
    const map = new Map<number, number>([
      [2, 20],
      [0, 5],
      [1, 15],
    ]);
    expect(serializeNumberMap(map)).toEqual([
      [2, 20],
      [0, 5],
      [1, 15],
    ]);
  });

  it('handles an empty map', () => {
    expect(serializeNumberMap(new Map())).toEqual([]);
  });
});

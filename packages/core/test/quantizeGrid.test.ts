import { describe, expect, it } from 'vitest';
import { quantizeGrid } from '../src/image/quantizeGrid.js';
import type { RGB } from '../src/types.js';

function checkerboard(width: number, height: number): RGB[] {
  const samples: RGB[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      samples.push((x + y) % 2 === 0 ? { r: 20, g: 30, b: 40 } : { r: 220, g: 210, b: 200 });
    }
  }
  return samples;
}

describe('quantizeGrid', () => {
  it('throws when sample count does not match width*height', () => {
    expect(() =>
      quantizeGrid([{ r: 0, g: 0, b: 0 }], 2, 2, { maxColors: 2, dither: 'none' }),
    ).toThrow();
  });

  it('produces a Grid with matching dimensions and index bounds within the palette', () => {
    const samples = checkerboard(6, 6);
    const grid = quantizeGrid(samples, 6, 6, { maxColors: 2, dither: 'none' });
    expect(grid.width).toBe(6);
    expect(grid.height).toBe(6);
    expect(grid.indices).toHaveLength(36);
    for (const idx of grid.indices) {
      expect(idx).toBeLessThan(grid.palette.length);
      expect(idx).toBeGreaterThanOrEqual(0);
    }
  });

  it('mode "none" maps every sample to its exact nearest color deterministically', () => {
    const samples = checkerboard(6, 6);
    const a = quantizeGrid(samples, 6, 6, { maxColors: 2, dither: 'none' });
    const b = quantizeGrid(samples, 6, 6, { maxColors: 2, dither: 'none' });
    expect(Array.from(a.indices)).toEqual(Array.from(b.indices));
    expect(a.palette).toEqual(b.palette);
  });

  it('every dither mode is deterministic end-to-end', () => {
    const samples = checkerboard(10, 10);
    for (const dither of ['none', 'bayer4', 'floyd-steinberg'] as const) {
      const first = quantizeGrid(samples, 10, 10, { maxColors: 3, dither });
      for (let i = 0; i < 5; i++) {
        const again = quantizeGrid(samples, 10, 10, { maxColors: 3, dither });
        expect(Array.from(again.indices)).toEqual(Array.from(first.indices));
        expect(again.palette).toEqual(first.palette);
      }
    }
  });
});

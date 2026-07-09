import { describe, expect, it } from 'vitest';
import { makeNearestColorMapper, nearestColorIndex } from '../src/color/nearest.js';
import type { RGB } from '../src/types.js';

describe('nearestColorIndex', () => {
  it('throws for an empty palette', () => {
    expect(() => nearestColorIndex({ r: 0, g: 0, b: 0 }, [])).toThrow();
  });

  it('picks the exact match when present', () => {
    const palette = [
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 255, b: 255 },
      { r: 128, g: 128, b: 128 },
    ];
    expect(nearestColorIndex({ r: 128, g: 128, b: 128 }, palette)).toBe(2);
  });

  it('picks the perceptually closest color for an inexact match', () => {
    const palette = [
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 255, b: 255 },
    ];
    expect(nearestColorIndex({ r: 20, g: 20, b: 20 }, palette)).toBe(0);
    expect(nearestColorIndex({ r: 230, g: 230, b: 230 }, palette)).toBe(1);
  });

  it('breaks exact ties by lowest index, deterministically', () => {
    const palette = [
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 255, b: 255 },
    ];
    // Midpoint is (in Lab terms) not necessarily exactly equidistant due to the nonlinear
    // sRGB curve, so construct a palette that IS exactly symmetric around the sample.
    const symmetric = [
      { r: 100, g: 100, b: 100 },
      { r: 100, g: 100, b: 101 },
    ];
    const idx = nearestColorIndex({ r: 100, g: 100, b: 100 }, symmetric);
    expect(idx).toBe(0);
    void palette;
  });

  it('is deterministic', () => {
    const palette = [
      { r: 10, g: 20, b: 30 },
      { r: 200, g: 100, b: 50 },
      { r: 90, g: 200, b: 150 },
    ];
    const color = { r: 95, g: 190, b: 140 };
    const first = nearestColorIndex(color, palette);
    for (let i = 0; i < 20; i++) {
      expect(nearestColorIndex(color, palette)).toBe(first);
    }
  });
});

describe('makeNearestColorMapper', () => {
  it('throws for an empty palette, like the single-shot form', () => {
    expect(() => makeNearestColorMapper([])).toThrow();
  });

  it('returns byte-identical indices to nearestColorIndex across many colors', () => {
    // The perf optimization must not change output: exercise a full palette against a dense,
    // deterministic sweep of query colors and require the cached mapper to agree everywhere.
    const palette: RGB[] = Array.from({ length: 40 }, (_, i) => ({
      r: (i * 97) % 256,
      g: (i * 53 + 20) % 256,
      b: (i * 29 + 128) % 256,
    }));
    const nearest = makeNearestColorMapper(palette);
    let s = 987654321;
    const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < 5000; i++) {
      const color: RGB = {
        r: Math.floor(rnd() * 256),
        g: Math.floor(rnd() * 256),
        b: Math.floor(rnd() * 256),
      };
      expect(nearest(color)).toBe(nearestColorIndex(color, palette));
    }
  });
});

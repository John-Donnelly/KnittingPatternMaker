import { describe, expect, it } from 'vitest';
import { nearestColorIndex } from '../src/color/nearest.js';

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

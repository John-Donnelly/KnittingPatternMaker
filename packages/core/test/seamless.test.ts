import { describe, expect, it } from 'vitest';
import { makeSeamless } from '../src/image/seamless.js';
import type { RGB } from '../src/types.js';

function gray(values: readonly number[]): RGB[] {
  return values.map((v) => ({ r: v, g: v, b: v }));
}

describe('makeSeamless', () => {
  it('matches a hand-computed result for a single horizontal row', () => {
    // Two smooth runs (0..30 and 100..130) with a hard jump at the wrap boundary
    // (130 next to 0). blendFraction=0.15, length=8 -> band = min(floor(8*0.15), 3) = 1.
    const samples = gray([0, 10, 20, 30, 100, 110, 120, 130]);
    const result = makeSeamless(samples, 8, 1, { horizontal: true, vertical: false });
    // shift=4: [100,110,120,130,0,10,20,30], seam between index 3 (130) and 4 (0).
    // band=1, k=1: weight=0.5 -> both blended positions become the exact midpoint, 65.
    expect(result.map((c) => c.r)).toEqual([100, 110, 120, 65, 65, 10, 20, 30]);
  });

  it('matches the same hand-computed result transposed for a single vertical column', () => {
    const samples = gray([0, 10, 20, 30, 100, 110, 120, 130]);
    const result = makeSeamless(samples, 1, 8, { horizontal: false, vertical: true });
    expect(result.map((c) => c.r)).toEqual([100, 110, 120, 65, 65, 10, 20, 30]);
  });

  it('returns an unchanged copy when neither axis is requested', () => {
    const samples = gray([1, 2, 3, 4]);
    const result = makeSeamless(samples, 4, 1, { horizontal: false, vertical: false });
    expect(result).toEqual(samples);
  });

  it('leaves an axis unchanged when its length is below the minimum blend dimension', () => {
    const samples = gray([5, 250, 5]); // length 3 < MIN_DIMENSION_FOR_BLEND
    const result = makeSeamless(samples, 3, 1, { horizontal: true, vertical: false });
    expect(result.map((c) => c.r)).toEqual([5, 250, 5]);
  });

  it('throws when samples length does not match width*height', () => {
    expect(() =>
      makeSeamless(gray([1, 2, 3]), 2, 2, { horizontal: true, vertical: false }),
    ).toThrow();
  });

  it('preserves grid dimensions when both axes are requested', () => {
    const width = 10;
    const height = 6;
    const samples: RGB[] = Array.from({ length: width * height }, (_, i) => ({
      r: i % 256,
      g: (i * 3) % 256,
      b: (i * 7) % 256,
    }));
    const result = makeSeamless(samples, width, height, { horizontal: true, vertical: true });
    expect(result).toHaveLength(width * height);
  });

  it('measurably reduces the wrap-around discontinuity on a real edge mismatch', () => {
    // A smooth ramp (0, 10, 20, ..., 190) is continuous everywhere EXCEPT at the wrap point
    // (190 next to 0, a jump of 190) -- exactly the case seamless tiling exists to fix. Since
    // the ramp is smooth at its own center too, the offset moves that already-smooth content
    // to the new edges, and the actual discontinuity gets relocated to the middle and blended.
    const width = 20;
    const height = 1;
    const samples = gray(Array.from({ length: width }, (_, x) => x * 10));
    const before = Math.abs((samples[0]?.r ?? 0) - (samples[width - 1]?.r ?? 0));

    const result = makeSeamless(samples, width, height, { horizontal: true, vertical: false });
    const after = Math.abs((result[0]?.r ?? 0) - (result[width - 1]?.r ?? 0));

    expect(before).toBe(190);
    expect(after).toBeLessThan(before);
  });

  it('is deterministic across repeated calls', () => {
    const width = 12;
    const height = 9;
    const samples: RGB[] = Array.from({ length: width * height }, (_, i) => ({
      r: (i * 17) % 256,
      g: (i * 31) % 256,
      b: (i * 53) % 256,
    }));
    const a = makeSeamless(samples, width, height, { horizontal: true, vertical: true });
    const b = makeSeamless(samples, width, height, { horizontal: true, vertical: true });
    expect(a).toEqual(b);
  });

  it('produces integer RGB channel values', () => {
    const samples = gray([0, 10, 20, 30, 100, 110, 120, 130]);
    const result = makeSeamless(samples, 8, 1, { horizontal: true, vertical: false });
    for (const c of result) {
      expect(Number.isInteger(c.r)).toBe(true);
      expect(Number.isInteger(c.g)).toBe(true);
      expect(Number.isInteger(c.b)).toBe(true);
    }
  });
});

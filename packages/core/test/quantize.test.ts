import { describe, expect, it } from 'vitest';
import { medianCutPalette } from '../src/color/quantize.js';
import type { RGB } from '../src/types.js';

function randomishSamples(count: number): RGB[] {
  // Deterministic pseudo-random-looking sample generator (no Math.random) so tests are
  // themselves reproducible.
  const samples: RGB[] = [];
  let seed = 1;
  for (let i = 0; i < count; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const r = seed % 256;
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const g = seed % 256;
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const b = seed % 256;
    samples.push({ r, g, b });
  }
  return samples;
}

describe('medianCutPalette', () => {
  it('throws for maxColors < 1', () => {
    expect(() => medianCutPalette([{ r: 0, g: 0, b: 0 }], 0)).toThrow();
  });

  it('throws for zero samples', () => {
    expect(() => medianCutPalette([], 4)).toThrow();
  });

  it('collapses a single unique color to one palette entry regardless of maxColors', () => {
    const samples: RGB[] = new Array(10).fill({ r: 100, g: 150, b: 200 });
    const palette = medianCutPalette(samples, 8);
    expect(palette).toHaveLength(1);
    expect(palette[0]).toEqual({ r: 100, g: 150, b: 200 });
  });

  it('never returns more colors than requested', () => {
    const samples = randomishSamples(200);
    for (const maxColors of [1, 2, 4, 8, 16]) {
      const palette = medianCutPalette(samples, maxColors);
      expect(palette.length).toBeLessThanOrEqual(maxColors);
    }
  });

  it('never returns more colors than distinct input colors', () => {
    const samples: RGB[] = [
      { r: 0, g: 0, b: 0 },
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 255, b: 255 },
    ];
    const palette = medianCutPalette(samples, 8);
    expect(palette.length).toBeLessThanOrEqual(2);
  });

  it('is deterministic: identical input always yields identical output', () => {
    const samples = randomishSamples(500);
    const a = medianCutPalette(samples, 6);
    const b = medianCutPalette(samples.slice(), 6);
    expect(a).toEqual(b);
  });

  it('is deterministic across many repeated runs (no hidden RNG/state)', () => {
    const samples = randomishSamples(300);
    const first = medianCutPalette(samples, 5);
    for (let i = 0; i < 10; i++) {
      expect(medianCutPalette(samples, 5)).toEqual(first);
    }
  });

  it('orders the resulting palette from darkest to lightest', () => {
    const samples: RGB[] = [
      { r: 10, g: 10, b: 10 },
      { r: 240, g: 240, b: 240 },
      { r: 120, g: 120, b: 120 },
    ];
    const palette = medianCutPalette(samples, 3);
    for (let i = 1; i < palette.length; i++) {
      const prev = palette[i - 1];
      const cur = palette[i];
      if (!prev || !cur) continue;
      // luminance non-decreasing
      expect(prev.r + prev.g + prev.b).toBeLessThanOrEqual(cur.r + cur.g + cur.b);
    }
  });

  it('splits two well-separated clusters into two colors when maxColors=2', () => {
    const samples: RGB[] = [
      ...new Array(20).fill({ r: 10, g: 10, b: 10 }),
      ...new Array(20).fill({ r: 250, g: 250, b: 250 }),
    ];
    const palette = medianCutPalette(samples, 2);
    expect(palette).toHaveLength(2);
    expect(palette[0]).toEqual({ r: 10, g: 10, b: 10 });
    expect(palette[1]).toEqual({ r: 250, g: 250, b: 250 });
  });

  it('spreads the palette evenly across a smooth gradient (no sliver-peeling degeneration)', () => {
    // Regression test: a uniform 0..255 ramp has no dominant gap — every adjacent pair
    // differs by the same amount. A naive largest-gap split ties on the FIRST gap and peels
    // one-sample slivers off the dark end (producing palettes like [2, 11, 24, 37, 50, 158]),
    // instead of halving the range. The hybrid rule must fall back to median splits here and
    // cover the full range roughly evenly.
    const samples: RGB[] = Array.from({ length: 256 }, (_, v) => ({ r: v, g: v, b: v }));
    const palette = medianCutPalette(samples, 6);
    expect(palette).toHaveLength(6);

    // Full range covered...
    expect(palette[0]!.r).toBeLessThan(55);
    expect(palette[5]!.r).toBeGreaterThan(200);
    // ...with no giant hole between adjacent palette entries (perfectly even spacing for
    // 6 buckets of 256 values would be ~42.7 apart).
    for (let i = 1; i < palette.length; i++) {
      expect(palette[i]!.r - palette[i - 1]!.r).toBeLessThan(80);
    }
  });
});

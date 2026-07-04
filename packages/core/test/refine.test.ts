import { describe, expect, it } from 'vitest';
import { adaptivePalette } from '../src/color/refine.js';
import { medianCutPalette } from '../src/color/quantize.js';
import { labDistanceSq, rgbToLab } from '../src/color/lab.js';
import type { RGB } from '../src/types.js';

const dE = (a: RGB, b: RGB) => Math.sqrt(labDistanceSq(rgbToLab(a), rgbToLab(b)));

/** Linear sRGB-space blend of two colors, like a box-averaged edge cell would produce. */
function blend(a: RGB, b: RGB, t: number): RGB {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

function fill(color: RGB, count: number): RGB[] {
  return new Array<RGB>(count).fill(color);
}

describe('adaptivePalette', () => {
  it('throws for maxColors < 1 and for zero samples', () => {
    expect(() => adaptivePalette([{ r: 0, g: 0, b: 0 }], 0)).toThrow();
    expect(() => adaptivePalette([], 4)).toThrow();
  });

  it('returns the exact colors when there are fewer distinct colors than slots', () => {
    const samples = [...fill({ r: 200, g: 10, b: 10 }, 5), ...fill({ r: 10, g: 10, b: 200 }, 5)];
    const palette = adaptivePalette(samples, 8);
    expect(palette).toHaveLength(2);
    expect(palette).toContainEqual({ r: 200, g: 10, b: 10 });
    expect(palette).toContainEqual({ r: 10, g: 10, b: 200 });
  });

  it('never returns more colors than requested', () => {
    const samples: RGB[] = [];
    let seed = 1;
    for (let i = 0; i < 500; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      samples.push({ r: seed % 256, g: (seed >> 8) % 256, b: (seed >> 16) % 256 });
    }
    for (const maxColors of [1, 2, 5, 9]) {
      expect(adaptivePalette(samples, maxColors).length).toBeLessThanOrEqual(maxColors);
    }
  });

  it('snaps palette entries to the dominant ACTUAL color, not the cluster mean (flat art)', () => {
    // A flat red region plus a minority of dark edge-blend cells. Plain box averaging inside
    // median-cut would return a slightly muddied red; the refinement must return the exact
    // flat color because it dominates its cluster.
    const red = { r: 220, g: 30, b: 30 };
    const white = { r: 250, g: 250, b: 250 };
    const samples = [
      ...fill(red, 80),
      ...fill(white, 80),
      // edge cells: red/white blends, a minority
      ...fill(blend(red, white, 0.35), 6),
      ...fill(blend(red, white, 0.65), 6),
    ];
    const palette = adaptivePalette(samples, 2);
    expect(palette).toContainEqual(red);
    expect(palette).toContainEqual(white);
  });

  it('merges palette entries too close to distinguish as yarn, returning FEWER than maxColors', () => {
    // Two nearly identical lights (~1.2 dE apart — indistinguishable as yarn) plus one dark:
    // asking for 4 colors must not waste two slots on the twins. New expectation vs plain
    // median-cut, which happily returns both lights as separate entries.
    const light = { r: 200, g: 200, b: 200 };
    const lightTwin = { r: 203, g: 203, b: 203 };
    expect(dE(light, lightTwin)).toBeLessThan(2);
    const samples = [
      ...fill(light, 50),
      ...fill(lightTwin, 50),
      ...fill({ r: 20, g: 20, b: 20 }, 50),
    ];
    const palette = adaptivePalette(samples, 4);
    expect(palette.length).toBe(2);
  });

  it('prunes a negligible near-duplicate shade but keeps a tiny high-contrast accent', () => {
    const white = { r: 250, g: 250, b: 250 };
    const nearWhite = { r: 243, g: 244, b: 246 }; // negligible coverage, ~2 dE from white
    const black = { r: 10, g: 10, b: 10 }; // tiny accent (an "eye"), huge dE from the rest
    const sky = { r: 110, g: 190, b: 235 };
    const samples = [
      ...fill(white, 400),
      ...fill(sky, 400),
      ...fill(nearWhite, 3),
      ...fill(black, 3),
    ];
    const palette = adaptivePalette(samples, 3);
    // The accent survives exactly; the near-white shade does not get its own slot.
    expect(palette).toContainEqual(black);
    expect(palette).not.toContainEqual(nearWhite);
    expect(palette).toContainEqual(white);
  });

  it('rescues a distinct color that plain median-cut buries inside another box', () => {
    // Regression of the measured "gray seagull vanishes into the sky" failure: a large sky,
    // two dark colors that median-cut merges into ONE muddy box (because its slots get spent
    // on edge-blend colors), and edge blends between sky and the darks. The refinement must
    // spend slots on the real colors, not the blends.
    const sky = { r: 110, g: 190, b: 235 };
    const black = { r: 25, g: 25, b: 25 };
    const brown = { r: 140, g: 70, b: 20 };
    const samples = [
      ...fill(sky, 600),
      ...fill(black, 120),
      ...fill(brown, 60),
      // anti-aliased edges: sky-black and sky-brown blends at several ratios
      ...fill(blend(sky, black, 0.3), 8),
      ...fill(blend(sky, black, 0.5), 8),
      ...fill(blend(sky, black, 0.7), 8),
      ...fill(blend(sky, brown, 0.4), 8),
      ...fill(blend(sky, brown, 0.6), 8),
    ];
    const palette = adaptivePalette(samples, 3);
    expect(palette).toContainEqual(sky);
    expect(palette).toContainEqual(black);
    expect(palette).toContainEqual(brown);
  });

  it('produces no phantom entries far from every sample on flat-art-like input', () => {
    const colors: RGB[] = [
      { r: 25, g: 25, b: 25 },
      { r: 140, g: 70, b: 20 },
      { r: 110, g: 190, b: 235 },
      { r: 250, g: 230, b: 160 },
      { r: 0, g: 85, b: 255 },
    ];
    const counts = [200, 120, 700, 60, 10];
    const samples: RGB[] = [];
    colors.forEach((c, i) => samples.push(...fill(c, counts[i] ?? 0)));
    // plus edge blends between neighbors in the list
    for (let i = 1; i < colors.length; i++) {
      const a = colors[i - 1];
      const b = colors[i];
      if (a && b) samples.push(...fill(blend(a, b, 0.5), 4));
    }
    const palette = adaptivePalette(samples, 5);
    for (const entry of palette) {
      const min = Math.min(...colors.map((c) => dE(entry, c)));
      // Every palette entry is (close to) a real color, never a blend-of-blends invention.
      expect(min).toBeLessThan(5);
    }
  });

  it('keeps photo-like smooth gradients spread across the range (no flat-art bias)', () => {
    // A smooth ramp has no dominant exact color, so mode-snapping must NOT kick in and the
    // palette should still cover the range about evenly (same property as medianCutPalette).
    const samples: RGB[] = Array.from({ length: 256 }, (_, v) => ({ r: v, g: v, b: v }));
    const palette = adaptivePalette(samples, 6);
    expect(palette.length).toBe(6);
    expect(palette[0]!.r).toBeLessThan(55);
    expect(palette[palette.length - 1]!.r).toBeGreaterThan(200);
    for (let i = 1; i < palette.length; i++) {
      expect(palette[i]!.r - palette[i - 1]!.r).toBeLessThan(80);
    }
  });

  it('orders the palette darkest to lightest', () => {
    const samples = [
      ...fill({ r: 240, g: 240, b: 240 }, 30),
      ...fill({ r: 10, g: 10, b: 10 }, 30),
      ...fill({ r: 120, g: 120, b: 120 }, 30),
      ...fill({ r: 200, g: 30, b: 30 }, 30),
      ...fill({ r: 30, g: 30, b: 200 }, 30),
    ];
    const palette = adaptivePalette(samples, 5);
    for (let i = 1; i < palette.length; i++) {
      const prev = palette[i - 1]!;
      const cur = palette[i]!;
      expect(prev.r + prev.g + prev.b).toBeLessThanOrEqual(cur.r + cur.g + cur.b + 128);
    }
  });

  it('is deterministic across repeated runs and input permutations', () => {
    const samples: RGB[] = [];
    let seed = 7;
    for (let i = 0; i < 400; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      samples.push({ r: seed % 256, g: (seed >> 7) % 256, b: (seed >> 14) % 256 });
    }
    const first = adaptivePalette(samples, 7);
    for (let i = 0; i < 5; i++) {
      expect(adaptivePalette(samples, 7)).toEqual(first);
    }
    // Same multiset, different order: unique colors are canonicalized by packed key, so the
    // result must be identical.
    expect(adaptivePalette(samples.slice().reverse(), 7)).toEqual(first);
  });

  it('never does worse than median-cut by more than the merge tolerance on total error', () => {
    // Sanity bound: refinement is meant to REDUCE weighted assignment error; allow a small
    // slack for mode-snapping (which trades tiny mean-error for real-color fidelity).
    const samples: RGB[] = [];
    let seed = 3;
    for (let i = 0; i < 600; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const base = seed % 4;
      const jitter = (seed >> 8) % 7;
      const c = [
        { r: 30 + jitter, g: 30, b: 30 },
        { r: 200, g: 60 + jitter, b: 40 },
        { r: 90, g: 160, b: 220 + (jitter % 5) },
        { r: 240, g: 240 - jitter, b: 210 },
      ][base]!;
      samples.push(c);
    }
    const err = (palette: RGB[]) => {
      let sum = 0;
      for (const s of samples) {
        let best = Infinity;
        for (const p of palette) best = Math.min(best, labDistanceSq(rgbToLab(s), rgbToLab(p)));
        sum += best;
      }
      return sum;
    };
    const refined = err(adaptivePalette(samples, 4));
    const plain = err(medianCutPalette(samples, 4));
    expect(refined).toBeLessThanOrEqual(plain * 1.25 + samples.length * 4 * 4);
  });
});

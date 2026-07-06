import { describe, expect, it } from 'vitest';
import { canWrapPatch, quiltOverlap, quiltSeamless, quiltWrapPatch } from '../src/image/quilt.js';
import { labDistanceSq, rgbToLab } from '../src/color/lab.js';
import type { RGB } from '../src/types.js';

const dist = (a: RGB, b: RGB) => Math.sqrt(labDistanceSq(rgbToLab(a), rgbToLab(b)));

/** Builds a sampled grid from a continuous function of SOURCE coordinates, mimicking how an
 * oversampled crop sees the continuation of the motif past its right/bottom edge. */
function sampleField(
  sampledW: number,
  sampledH: number,
  field: (x: number, y: number) => RGB,
): RGB[] {
  const out: RGB[] = [];
  for (let y = 0; y < sampledH; y++) {
    for (let x = 0; x < sampledW; x++) out.push(field(x, y));
  }
  return out;
}

describe('quiltOverlap', () => {
  it('scales with the axis and disables below the minimum', () => {
    expect(quiltOverlap(9)).toBe(0);
    expect(quiltOverlap(10)).toBe(2);
    expect(quiltOverlap(40)).toBe(8);
    expect(quiltOverlap(400)).toBe(8);
  });
});

describe('quiltSeamless', () => {
  it('returns the target dimensions', () => {
    const samples = sampleField(48, 46, (x, y) => ({ r: x, g: y, b: 0 }));
    const out = quiltSeamless(samples, 48, 46, 40, 40);
    expect(out).toHaveLength(40 * 40);
  });

  it('makes a hard-wrap ramp tile with a small join residual', () => {
    // Horizontal ramp: value climbs with x, so the raw wrap join (255-ish -> 0-ish) is the
    // worst case. The quilted output's wrap jump must be no worse than its interior contrast
    // scale (a straight crop would jump by ~the whole range).
    const W = 40;
    const k = quiltOverlap(W);
    const samples = sampleField(W + k, 10, (x) => {
      const v = Math.round((x / (W + k - 1)) * 255);
      return { r: v, g: v, b: v };
    });
    const out = quiltSeamless(samples, W + k, 10, W, 10);

    let joinJump = 0;
    let interiorMax = 0;
    for (let y = 0; y < 10; y++) {
      const row = out.slice(y * W, (y + 1) * W);
      joinJump = Math.max(joinJump, dist(row[W - 1] as RGB, row[0] as RGB));
      for (let x = 1; x < W; x++) {
        interiorMax = Math.max(interiorMax, dist(row[x - 1] as RGB, row[x] as RGB));
      }
    }
    // Raw wrap jump on this ramp is ~100 Lab; the quilted join must sit within the fabric's
    // own local contrast, i.e. read as just another stitch step.
    expect(joinJump).toBeLessThanOrEqual(interiorMax * 1.5);
  });

  it('starts the merged strip with continuation content (exact wrap flow)', () => {
    // Field where the continuation columns are a distinct color from the left edge: the
    // output's first column must come from the continuation (cut >= 1), because that is what
    // the output's LAST column flows into in the source.
    const W = 20;
    const k = quiltOverlap(W); // 4
    const RED = { r: 200, g: 30, b: 30 };
    const BLUE = { r: 30, g: 60, b: 200 };
    const samples = sampleField(W + k, 8, (x) => (x >= W ? BLUE : RED));
    const out = quiltSeamless(samples, W + k, 8, W, 8);
    for (let y = 0; y < 8; y++) {
      expect(out[y * W]).toEqual(BLUE);
      expect(out[y * W + (W - 1)]).toEqual(RED);
    }
  });

  it('leaves the interior untouched', () => {
    const W = 30;
    const H = 24;
    const kx = quiltOverlap(W);
    const ky = quiltOverlap(H);
    let seed = 9;
    const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 256;
    const samples = sampleField(W + kx, H + ky, () => ({ r: rand(), g: rand(), b: rand() }));
    const out = quiltSeamless(samples, W + kx, H + ky, W, H);
    // Cells beyond both overlap zones must be byte-identical to the input.
    for (let y = ky; y < H; y++) {
      for (let x = kx; x < W; x++) {
        expect(out[y * W + x]).toEqual(samples[y * (W + kx) + x]);
      }
    }
  });

  it('is deterministic', () => {
    const samples = sampleField(46, 36, (x, y) => ({
      r: (x * 37) % 256,
      g: (y * 53) % 256,
      b: (x * y) % 256,
    }));
    const a = quiltSeamless(samples, 46, 36, 40, 30);
    const b = quiltSeamless(samples, 46, 36, 40, 30);
    expect(a).toEqual(b);
  });
});

describe('quiltWrapPatch', () => {
  it('reports applicability correctly', () => {
    expect(canWrapPatch(8)).toBe(false);
    expect(canWrapPatch(40)).toBe(true);
  });

  it('makes the wrap join continuous using the motif interior (no extra content)', () => {
    // Ramp with a hard wrap discontinuity plus a self-similar interior: the interior holds
    // every gray level, so a patch exists whose halves match both edges.
    const W = 40;
    const H = 12;
    const samples = sampleField(W, H, (x) => {
      const v = Math.round((x / (W - 1)) * 255);
      return { r: v, g: v, b: v };
    });
    const out = quiltWrapPatch(samples, W, H, { horizontal: true, vertical: false });
    expect(out).toHaveLength(W * H);

    let joinJump = 0;
    let interiorMax = 0;
    for (let y = 0; y < H; y++) {
      const row = out.slice(y * W, (y + 1) * W);
      joinJump = Math.max(joinJump, dist(row[W - 1] as RGB, row[0] as RGB));
      for (let x = 1; x < W; x++) {
        interiorMax = Math.max(interiorMax, dist(row[x - 1] as RGB, row[x] as RGB));
      }
    }
    // Raw wrap jump on this ramp is ~100 Lab; after patching, the join must read like any
    // other stitch step in the fabric.
    expect(joinJump).toBeLessThanOrEqual(interiorMax * 1.5);
  });

  it('leaves the interior untouched and is deterministic', () => {
    const W = 36;
    const H = 20;
    let seed = 5;
    const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 256;
    const samples = sampleField(W, H, () => ({ r: rand(), g: rand(), b: rand() }));
    const a = quiltWrapPatch(samples, W, H, { horizontal: true, vertical: true });
    const b = quiltWrapPatch(samples, W, H, { horizontal: true, vertical: true });
    expect(a).toEqual(b);
    const k = Math.min(quiltOverlap(W), Math.floor(W / 4));
    const ky = Math.min(quiltOverlap(H), Math.floor(H / 4));
    for (let y = ky; y < H - ky; y++) {
      for (let x = k; x < W - k; x++) {
        expect(a[y * W + x]).toEqual(samples[y * W + x]);
      }
    }
  });
});

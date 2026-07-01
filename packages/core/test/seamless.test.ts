import { describe, expect, it } from 'vitest';
import { makeSeamless } from '../src/image/seamless.js';
import type { RGB } from '../src/types.js';

function gray(values: readonly number[]): RGB[] {
  return values.map((v) => ({ r: v, g: v, b: v }));
}

describe('makeSeamless', () => {
  it('matches a hand-computed result for a single horizontal row', () => {
    // Two flat halves: wrap join (255 next to 0) is a hard seam, interior jump at index 2->3
    // is part of the design. Black<->white Lab distance is 100 -> raw band ceil(100/12)=9,
    // capped by maxBand = min(floor((6-2)/2), round(6*0.25)) = 2.
    // Neighborhood positions (len-2+j)%6 for j=0..3 -> 4,5,0,1.
    // Anchors: start=line[3]=255, end=line[2]=0. Bridge t=(j+1)/5 -> 204, 153, 102, 51.
    // Weights: j=0 -> 0.5, j=1 -> 1, j=2 -> 1, j=3 -> 0.5.
    // out[4]=lerp(255,204,.5)=229.5->230; out[5]=153; out[0]=102; out[1]=lerp(0,51,.5)=25.5->26.
    const samples = gray([0, 0, 0, 255, 255, 255]);
    const result = makeSeamless(samples, 6, 1, { horizontal: true, vertical: false });
    expect(result.map((c) => c.r)).toEqual([102, 26, 0, 255, 230, 153]);
  });

  it('matches the same hand-computed result transposed for a single vertical column', () => {
    const samples = gray([0, 0, 0, 255, 255, 255]);
    const result = makeSeamless(samples, 1, 6, { horizontal: false, vertical: true });
    expect(result.map((c) => c.r)).toEqual([102, 26, 0, 255, 230, 153]);
  });

  it('leaves the interior of the design completely untouched (no offset through the middle)', () => {
    // A smooth ramp 0..190: wrap join jumps 190, interior is gentle. band computed from the
    // seam severity, capped at maxBand=5 for len 20 -> neighborhood is positions 15..19,0..4.
    // Positions 5..14 (the visible middle of the design) must be byte-identical to the input.
    const samples = gray(Array.from({ length: 20 }, (_, x) => x * 10));
    const result = makeSeamless(samples, 20, 1, { horizontal: true, vertical: false });
    for (let x = 5; x <= 14; x++) {
      expect(result[x]).toEqual(samples[x]);
    }
  });

  it('guarantees a small residual jump at the tile join for a hard wrap edge', () => {
    // Ramp 0..190: original wrap jump is 190. With band 5, the join-adjacent samples both come
    // purely from the bridge (anchors line[14]=140 and line[5]=50, gap 90 over 11 steps), so
    // out[19]=140-90*5/11=99.09->99 and out[0]=140-90*6/11=90.9->91 — an 8-value residual.
    const samples = gray(Array.from({ length: 20 }, (_, x) => x * 10));
    const result = makeSeamless(samples, 20, 1, { horizontal: true, vertical: false });
    expect(result[19]?.r).toBe(99);
    expect(result[0]?.r).toBe(91);
    expect(Math.abs((result[19]?.r ?? 0) - (result[0]?.r ?? 0))).toBeLessThanOrEqual(9);
  });

  it('leaves already-tileable high-frequency content (checkerboard) completely unchanged', () => {
    // Checkerboard: the wrap jump equals the line's own stitch-to-stitch contrast, so the line
    // already reads as continuous when tiled — the intelligent skip must not smooth it.
    const samples = gray([0, 255, 0, 255, 0, 255, 0, 255]);
    const result = makeSeamless(samples, 8, 1, { horizontal: true, vertical: false });
    expect(result.map((c) => c.r)).toEqual([0, 255, 0, 255, 0, 255, 0, 255]);
  });

  it('leaves a solid-color grid unchanged', () => {
    const samples = gray(new Array(24).fill(80));
    const result = makeSeamless(samples, 6, 4, { horizontal: true, vertical: true });
    expect(result.map((c) => c.r)).toEqual(new Array(24).fill(80));
  });

  it('returns an unchanged copy when neither axis is requested', () => {
    const samples = gray([1, 2, 3, 4]);
    const result = makeSeamless(samples, 4, 1, { horizontal: false, vertical: false });
    expect(result).toEqual(samples);
    expect(result).not.toBe(samples);
  });

  it('leaves an axis unchanged when its length is below the minimum blend dimension', () => {
    const samples = gray([5, 250, 5]);
    const result = makeSeamless(samples, 3, 1, { horizontal: true, vertical: false });
    expect(result.map((c) => c.r)).toEqual([5, 250, 5]);
  });

  it('throws when samples length does not match width*height', () => {
    expect(() =>
      makeSeamless(gray([1, 2, 3]), 2, 2, { horizontal: true, vertical: false }),
    ).toThrow();
  });

  it('preserves grid dimensions and produces integer channels when both axes are requested', () => {
    const width = 12;
    const height = 9;
    const samples: RGB[] = Array.from({ length: width * height }, (_, i) => ({
      r: (i * 17) % 256,
      g: (i * 31) % 256,
      b: (i * 53) % 256,
    }));
    const result = makeSeamless(samples, width, height, { horizontal: true, vertical: true });
    expect(result).toHaveLength(width * height);
    for (const c of result) {
      expect(Number.isInteger(c.r)).toBe(true);
      expect(Number.isInteger(c.g)).toBe(true);
      expect(Number.isInteger(c.b)).toBe(true);
    }
  });

  it('reduces the wrap mismatch on BOTH axes of a 2D gradient', () => {
    // Diagonal gradient: hard wrap seams on both axes.
    const width = 16;
    const height = 12;
    const samples: RGB[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const v = Math.round(((x / (width - 1)) * 0.5 + (y / (height - 1)) * 0.5) * 255);
        samples.push({ r: v, g: v, b: v });
      }
    }
    const result = makeSeamless(samples, width, height, { horizontal: true, vertical: true });

    // Every row's join and every column's join should be dramatically smaller than the
    // original wrap jumps (~128 on each axis).
    for (let y = 0; y < height; y++) {
      const rowJump = Math.abs(
        (result[y * width + width - 1]?.r ?? 0) - (result[y * width]?.r ?? 0),
      );
      expect(rowJump).toBeLessThan(40);
    }
    for (let x = 0; x < width; x++) {
      const colJump = Math.abs((result[(height - 1) * width + x]?.r ?? 0) - (result[x]?.r ?? 0));
      expect(colJump).toBeLessThan(40);
    }
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
});

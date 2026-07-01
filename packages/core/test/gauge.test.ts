import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAUGE,
  finishedSize,
  stitchAspectRatio,
  suggestedCropRect,
} from '../src/image/gauge.js';

describe('stitchAspectRatio', () => {
  it('is greater than 1 for the default gauge (stitches wider than tall)', () => {
    expect(stitchAspectRatio()).toBeGreaterThan(1);
  });

  it('is exactly 1 for a gauge where sts/4in equals rows/4in', () => {
    expect(stitchAspectRatio({ stitchesPer4In: 20, rowsPer4In: 20 })).toBeCloseTo(1, 10);
  });

  it('throws for non-positive gauge values', () => {
    expect(() => stitchAspectRatio({ stitchesPer4In: 0, rowsPer4In: 20 })).toThrow();
    expect(() => stitchAspectRatio({ stitchesPer4In: 20, rowsPer4In: -1 })).toThrow();
  });

  it('is deterministic', () => {
    expect(stitchAspectRatio(DEFAULT_GAUGE)).toBe(stitchAspectRatio(DEFAULT_GAUGE));
  });
});

describe('finishedSize', () => {
  it('computes proportional finished dimensions', () => {
    const size = finishedSize(
      { widthStitches: 44, heightRows: 60 },
      { stitchesPer4In: 22, rowsPer4In: 30 },
    );
    expect(size.widthIn).toBeCloseTo(8, 5);
    expect(size.heightIn).toBeCloseTo(8, 5);
  });
});

describe('suggestedCropRect', () => {
  it('returns a rect within the source bounds', () => {
    const rect = suggestedCropRect(400, 300, 40, 30);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(400);
    expect(rect.y + rect.height).toBeLessThanOrEqual(300);
  });

  it('uses the full source when its aspect already matches the target', () => {
    // square gauge (aspect 1) and a square grid on a square source -> full-frame crop
    const rect = suggestedCropRect(200, 200, 20, 20, { stitchesPer4In: 20, rowsPer4In: 20 });
    expect(rect).toEqual({ x: 0, y: 0, width: 200, height: 200 });
  });

  it('centers the crop', () => {
    const rect = suggestedCropRect(400, 100, 10, 10, { stitchesPer4In: 20, rowsPer4In: 20 });
    // target aspect 1:1, source is 4:1 wide -> crop full height, centered width
    expect(rect.height).toBe(100);
    expect(rect.x).toBe(Math.floor((400 - rect.width) / 2));
  });

  it('throws for non-positive dimensions', () => {
    expect(() => suggestedCropRect(0, 100, 10, 10)).toThrow();
    expect(() => suggestedCropRect(100, 100, 0, 10)).toThrow();
  });

  it('is deterministic', () => {
    const a = suggestedCropRect(733, 511, 37, 41, { stitchesPer4In: 19, rowsPer4In: 27 });
    const b = suggestedCropRect(733, 511, 37, 41, { stitchesPer4In: 19, rowsPer4In: 27 });
    expect(a).toEqual(b);
  });
});

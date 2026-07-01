import { describe, expect, it } from 'vitest';
import { labDistanceSq, relativeLuminance, rgbToLab } from '../src/color/lab.js';

describe('rgbToLab', () => {
  it('maps white to L=100, a=0, b=0', () => {
    const lab = rgbToLab({ r: 255, g: 255, b: 255 });
    expect(lab.l).toBeCloseTo(100, 1);
    expect(lab.a).toBeCloseTo(0, 1);
    expect(lab.b).toBeCloseTo(0, 1);
  });

  it('maps black to L=0, a=0, b=0', () => {
    const lab = rgbToLab({ r: 0, g: 0, b: 0 });
    expect(lab.l).toBeCloseTo(0, 1);
    expect(lab.a).toBeCloseTo(0, 1);
    expect(lab.b).toBeCloseTo(0, 1);
  });

  it('is deterministic across repeated calls', () => {
    const color = { r: 123, g: 45, b: 200 };
    const a = rgbToLab(color);
    const b = rgbToLab(color);
    expect(a).toEqual(b);
  });
});

describe('labDistanceSq', () => {
  it('is zero for identical colors', () => {
    const lab = rgbToLab({ r: 10, g: 20, b: 30 });
    expect(labDistanceSq(lab, lab)).toBe(0);
  });

  it('is symmetric', () => {
    const a = rgbToLab({ r: 255, g: 0, b: 0 });
    const b = rgbToLab({ r: 0, g: 255, b: 0 });
    expect(labDistanceSq(a, b)).toBeCloseTo(labDistanceSq(b, a), 10);
  });

  it('black-white distance is larger than two similar grays', () => {
    const black = rgbToLab({ r: 0, g: 0, b: 0 });
    const white = rgbToLab({ r: 255, g: 255, b: 255 });
    const gray1 = rgbToLab({ r: 120, g: 120, b: 120 });
    const gray2 = rgbToLab({ r: 125, g: 125, b: 125 });
    expect(labDistanceSq(black, white)).toBeGreaterThan(labDistanceSq(gray1, gray2));
  });
});

describe('relativeLuminance', () => {
  it('white is brighter than black', () => {
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeGreaterThan(
      relativeLuminance({ r: 0, g: 0, b: 0 }),
    );
  });

  it('is deterministic', () => {
    const color = { r: 50, g: 150, b: 250 };
    expect(relativeLuminance(color)).toBe(relativeLuminance(color));
  });
});

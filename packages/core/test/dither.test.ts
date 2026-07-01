import { describe, expect, it } from 'vitest';
import { ditherBayer4, ditherFloydSteinberg } from '../src/image/dither.js';
import type { RGB } from '../src/types.js';

function gradientSamples(width: number, height: number): RGB[] {
  const samples: RGB[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = Math.round((x / (width - 1)) * 255);
      samples.push({ r: v, g: v, b: v });
    }
  }
  return samples;
}

const BLACK_WHITE_PALETTE: RGB[] = [
  { r: 0, g: 0, b: 0 },
  { r: 255, g: 255, b: 255 },
];

describe('ditherBayer4', () => {
  it('is deterministic across repeated calls', () => {
    const samples = gradientSamples(16, 16);
    const a = ditherBayer4(samples, 16, 16, BLACK_WHITE_PALETTE);
    const b = ditherBayer4(samples, 16, 16, BLACK_WHITE_PALETTE);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('produces a mix of both palette entries across a mid-gray gradient', () => {
    const samples = gradientSamples(16, 16);
    const indices = ditherBayer4(samples, 16, 16, BLACK_WHITE_PALETTE);
    const unique = new Set(Array.from(indices));
    expect(unique.size).toBe(2);
  });

  it('maps a uniform black image entirely to palette index 0', () => {
    const samples: RGB[] = new Array(64).fill({ r: 0, g: 0, b: 0 });
    const indices = ditherBayer4(samples, 8, 8, BLACK_WHITE_PALETTE);
    expect(Array.from(indices).every((i) => i === 0)).toBe(true);
  });
});

describe('ditherFloydSteinberg', () => {
  it('is deterministic across repeated calls', () => {
    const samples = gradientSamples(20, 20);
    const a = ditherFloydSteinberg(samples, 20, 20, BLACK_WHITE_PALETTE);
    const b = ditherFloydSteinberg(samples, 20, 20, BLACK_WHITE_PALETTE);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('produces a mix of both palette entries across a mid-gray gradient', () => {
    const samples = gradientSamples(20, 20);
    const indices = ditherFloydSteinberg(samples, 20, 20, BLACK_WHITE_PALETTE);
    const unique = new Set(Array.from(indices));
    expect(unique.size).toBe(2);
  });

  it('the proportion of white pixels roughly tracks the average gray level', () => {
    // A uniform 50% gray field should dither to roughly half white, half black.
    const samples: RGB[] = new Array(400).fill({ r: 128, g: 128, b: 128 });
    const indices = ditherFloydSteinberg(samples, 20, 20, BLACK_WHITE_PALETTE);
    const whiteCount = Array.from(indices).filter((i) => i === 1).length;
    expect(whiteCount).toBeGreaterThan(150);
    expect(whiteCount).toBeLessThan(250);
  });
});

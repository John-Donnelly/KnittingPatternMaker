import { describe, expect, it } from 'vitest';
import { resolveAutoOptions } from '../src/auto/autoSettings.js';
import { MAX_GRID_DIMENSION } from '../src/limits.js';
import type { PixelBuffer } from '../src/types.js';

/** Auto mode must produce valid, in-bounds options for ANY decodable image — no crashes,
 * no zero/oversized dimensions — however degenerate the input. */

function makeBuffer(
  width: number,
  height: number,
  fill: (x: number, y: number) => [number, number, number, number?],
): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = fill(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a ?? 255;
    }
  }
  return { width, height, data };
}

function expectValidOptions(source: PixelBuffer) {
  const { options } = resolveAutoOptions(source, {});
  expect(options.widthStitches).toBeGreaterThanOrEqual(1);
  expect(options.heightRows).toBeGreaterThanOrEqual(1);
  expect(options.widthStitches * options.repeat.across).toBeLessThanOrEqual(MAX_GRID_DIMENSION);
  expect(options.heightRows * options.repeat.down).toBeLessThanOrEqual(MAX_GRID_DIMENSION);
  expect(options.maxColors).toBeGreaterThanOrEqual(2);
  return options;
}

describe('auto mode edge cases', () => {
  it('handles a 1x1 image', () => {
    expectValidOptions(makeBuffer(1, 1, () => [120, 40, 200]));
  });

  it('handles a 1-pixel-tall strip and a 1-pixel-wide strip', () => {
    expectValidOptions(makeBuffer(500, 1, (x) => [x % 256, 100, 50]));
    expectValidOptions(makeBuffer(1, 500, (_x, y) => [50, y % 256, 100]));
  });

  it('handles an extreme aspect ratio without exceeding grid bounds', () => {
    const options = expectValidOptions(makeBuffer(4000, 40, (x) => [x % 256, 128, 64]));
    expect(options.widthStitches).toBeLessThanOrEqual(MAX_GRID_DIMENSION);
    expect(options.heightRows).toBeLessThanOrEqual(MAX_GRID_DIMENSION);
  });

  it('handles a single flat color (palette of one)', () => {
    const options = expectValidOptions(makeBuffer(100, 100, () => [200, 30, 30]));
    expect(options.technique).toBeDefined();
  });

  it('handles pure black-and-white line art', () => {
    expectValidOptions(
      makeBuffer(150, 150, (x, y) => ((x + y) % 10 === 0 ? [0, 0, 0] : [255, 255, 255])),
    );
  });

  it('handles fully transparent pixels (alpha is ignored, treated as color data)', () => {
    expectValidOptions(makeBuffer(64, 64, (x, y) => [x * 4, y * 4, 128, 0]));
  });

  it('handles pure noise', () => {
    // Deterministic pseudo-noise (no RNG in tests either).
    let seed = 42;
    const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 256;
    expectValidOptions(makeBuffer(120, 120, () => [rand(), rand(), rand()]));
  });

  it('respects repeat caps even when the image maps natively', () => {
    const flat = makeBuffer(100, 100, (x, y) =>
      x < 50 === y < 50 ? [200, 30, 30] : [245, 245, 245],
    );
    const { options } = resolveAutoOptions(flat, { repeat: { across: 5, down: 5 } });
    expect(options.widthStitches * 5).toBeLessThanOrEqual(MAX_GRID_DIMENSION);
    expect(options.heightRows * 5).toBeLessThanOrEqual(MAX_GRID_DIMENSION);
  });
});

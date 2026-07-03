import { describe, expect, it } from 'vitest';
import { analyzeImage } from '../src/auto/imageStats.js';
import {
  AUTO_INTARSIA_MAX_PALETTE,
  AUTO_STRANDED_MAX_PALETTE,
  resolveAutoOptions,
} from '../src/auto/autoSettings.js';
import { MAX_GRID_DIMENSION } from '../src/limits.js';
import type { PixelBuffer } from '../src/types.js';

function makeBuffer(
  width: number,
  height: number,
  fill: (x: number, y: number) => [number, number, number],
): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fill(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

const RED: [number, number, number] = [200, 30, 30];
const BLUE: [number, number, number] = [30, 60, 200];
const WHITE: [number, number, number] = [245, 245, 245];
const GREEN: [number, number, number] = [30, 160, 60];

/** Four solid quadrants — unambiguous flat-color art. */
function quadrants(size = 200): PixelBuffer {
  return makeBuffer(size, size, (x, y) => {
    if (y < size / 2) return x < size / 2 ? RED : WHITE;
    return x < size / 2 ? BLUE : GREEN;
  });
}

/** A steep two-axis color gradient — unambiguously photo-like (smooth transitions everywhere). */
function gradientPhoto(size = 200): PixelBuffer {
  return makeBuffer(size, size, (x, y) => [
    Math.round((x / (size - 1)) * 255),
    Math.round((y / (size - 1)) * 255),
    128,
  ]);
}

/** A grayscale gradient — photo-like and effectively monochrome. */
function grayGradient(size = 200): PixelBuffer {
  return makeBuffer(size, size, (x, y) => {
    const v = Math.round(((x + y) / (2 * (size - 1))) * 255);
    return [v, v, v];
  });
}

describe('analyzeImage', () => {
  it('classifies solid-quadrant art as flat art with the right color count', () => {
    const stats = analyzeImage(quadrants());
    expect(stats.isFlatArt).toBe(true);
    expect(stats.isNearMonochrome).toBe(false);
    expect(stats.significantColors).toBe(4);
  });

  it('classifies a steep gradient as photo-like', () => {
    const stats = analyzeImage(gradientPhoto());
    expect(stats.isFlatArt).toBe(false);
    expect(stats.gradientFraction).toBeGreaterThan(0.5);
  });

  it('classifies a grayscale gradient as near-monochrome', () => {
    const stats = analyzeImage(grayGradient());
    expect(stats.isNearMonochrome).toBe(true);
  });

  it('is deterministic', () => {
    expect(analyzeImage(gradientPhoto())).toEqual(analyzeImage(gradientPhoto()));
  });
});

describe('resolveAutoOptions', () => {
  it('picks dominant sampling for flat art and average for photos', () => {
    expect(resolveAutoOptions(quadrants(), {}).options.sampling).toBe('dominant');
    expect(resolveAutoOptions(gradientPhoto(), {}).options.sampling).toBe('average');
  });

  it('maps small flat-color pixel art 1 stitch per pixel with a full crop', () => {
    const source = makeBuffer(32, 24, (x, y) => (x < 16 === y < 12 ? RED : WHITE));
    const { options } = resolveAutoOptions(source, {});
    expect(options.widthStitches).toBe(32);
    expect(options.heightRows).toBe(24);
    expect(options.crop).toEqual({ x: 0, y: 0, width: 32, height: 24 });
  });

  it('sizes an unconstrained photo to a ~10in-wide panel with image proportions', () => {
    const { options } = resolveAutoOptions(gradientPhoto(400), {});
    // Default gauge 22 sts / 4in -> 10in target = 55 stitches.
    expect(options.widthStitches).toBe(55);
    // Square source, stitches wider than tall (30/22) -> more rows than stitches.
    expect(options.heightRows).toBeGreaterThan(options.widthStitches);
    expect(options.heightRows).toBeLessThanOrEqual(MAX_GRID_DIMENSION);
  });

  it('derives the missing dimension from the provided one', () => {
    const { options } = resolveAutoOptions(gradientPhoto(400), { widthStitches: 100 });
    expect(options.widthStitches).toBe(100);
    expect(options.heightRows).toBeGreaterThan(100);
    expect(options.heightRows).toBeLessThan(200);
  });

  it('picks stranded for two-color striped rows', () => {
    const stripes = makeBuffer(200, 200, (_x, y) => (Math.floor(y / 20) % 2 === 0 ? RED : WHITE));
    const { options } = resolveAutoOptions(stripes, {});
    expect(options.technique).toBe('stranded');
    expect(options.maxColors).toBeLessThanOrEqual(AUTO_STRANDED_MAX_PALETTE);
    expect(options.dither).toBe('none');
  });

  it('picks intarsia for wide multi-color vertical bands', () => {
    const bands = makeBuffer(200, 200, (x) => {
      const band = Math.floor(x / 50);
      return [RED, BLUE, GREEN, WHITE][band] ?? WHITE;
    });
    const { options } = resolveAutoOptions(bands, {});
    expect(options.technique).toBe('intarsia');
    expect(options.maxColors).toBeLessThanOrEqual(AUTO_INTARSIA_MAX_PALETTE);
    expect(options.maxColors).toBeGreaterThanOrEqual(4);
  });

  it('picks texture with dithering for a grayscale photo', () => {
    const { options } = resolveAutoOptions(grayGradient(), {});
    expect(options.technique).toBe('texture');
    expect(options.dither).toBe('floyd-steinberg');
  });

  it('falls back to stranded with a small palette for busy photo content', () => {
    // Per-pixel varied hues: many colors per row, far more runs than intarsia can manage.
    const busy = makeBuffer(200, 200, (x, y) => {
      const colors: [number, number, number][] = [RED, BLUE, GREEN, WHITE, [240, 200, 40]];
      return colors[(x * 7 + y * 13) % colors.length] ?? WHITE;
    });
    const { options } = resolveAutoOptions(busy, {});
    expect(options.technique).toBe('stranded');
    expect(options.maxColors).toBeLessThanOrEqual(AUTO_STRANDED_MAX_PALETTE);
  });

  it('passes user-provided fields through untouched and records no decision for them', () => {
    const { options, decisions } = resolveAutoOptions(gradientPhoto(), {
      technique: 'intarsia',
      widthStitches: 60,
      heightRows: 80,
      maxColors: 7,
      dither: 'bayer4',
      sampling: 'dominant',
      seamless: 'both',
      repeat: { across: 2, down: 2 },
      gauge: { stitchesPer4In: 18, rowsPer4In: 24 },
    });
    expect(options).toMatchObject({
      technique: 'intarsia',
      widthStitches: 60,
      heightRows: 80,
      maxColors: 7,
      dither: 'bayer4',
      sampling: 'dominant',
      seamless: 'both',
      repeat: { across: 2, down: 2 },
      gauge: { stitchesPer4In: 18, rowsPer4In: 24 },
    });
    const decidedFields = decisions.map((d) => d.field);
    for (const field of ['technique', 'maxColors', 'dither', 'sampling', 'seamless', 'size']) {
      expect(decidedFields).not.toContain(field);
    }
  });

  it('matches seamless blending to the repeat direction when unset', () => {
    const flat = quadrants();
    expect(resolveAutoOptions(flat, { repeat: { across: 3, down: 1 } }).options.seamless).toBe(
      'horizontal',
    );
    expect(resolveAutoOptions(flat, { repeat: { across: 1, down: 2 } }).options.seamless).toBe(
      'vertical',
    );
    expect(resolveAutoOptions(flat, { repeat: { across: 2, down: 2 } }).options.seamless).toBe(
      'both',
    );
    expect(resolveAutoOptions(flat, {}).options.seamless).toBe('none');
  });

  it('keeps the motif dimensions within the tiled grid limit', () => {
    const { options } = resolveAutoOptions(gradientPhoto(400), {
      repeat: { across: 8, down: 8 },
    });
    expect(options.widthStitches * options.repeat.across).toBeLessThanOrEqual(MAX_GRID_DIMENSION);
    expect(options.heightRows * options.repeat.down).toBeLessThanOrEqual(MAX_GRID_DIMENSION);
  });

  it('is fully deterministic', () => {
    const a = resolveAutoOptions(gradientPhoto(), {});
    const b = resolveAutoOptions(gradientPhoto(), {});
    expect(a.options).toEqual(b.options);
    expect(a.decisions).toEqual(b.decisions);
  });

  it('explains every choice it makes', () => {
    const { decisions } = resolveAutoOptions(quadrants(), {});
    expect(decisions.length).toBeGreaterThan(0);
    for (const d of decisions) {
      expect(d.reason.length).toBeGreaterThan(10);
      expect(d.value.length).toBeGreaterThan(0);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { generateTexturePattern, quantizeTexture } from '../src/pattern/textureKnitPurl.js';
import type { Grid, RGB } from '../src/types.js';

const DARK = { r: 10, g: 10, b: 10 };
const LIGHT = { r: 250, g: 250, b: 250 };

describe('quantizeTexture', () => {
  it('quantizes to at most 2 grayscale tones, darkest first', () => {
    const samples: RGB[] = [
      { r: 255, g: 0, b: 0 }, // red: some luminance
      { r: 0, g: 0, b: 255 }, // blue: darker luminance (Rec.709 weights)
    ];
    const grid = quantizeTexture(samples, 2, 1, 'none');
    expect(grid.palette.length).toBeLessThanOrEqual(2);
    // grayscale, so r/g/b channels should match within each palette entry
    for (const color of grid.palette) {
      expect(color.r).toBe(color.g);
      expect(color.g).toBe(color.b);
    }
  });

  it('a solid black vs solid white split yields exactly 2 tones, black darker', () => {
    const samples: RGB[] = [
      { r: 0, g: 0, b: 0 },
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 255, b: 255 },
      { r: 255, g: 255, b: 255 },
    ];
    const grid = quantizeTexture(samples, 2, 2, 'none');
    expect(grid.palette).toHaveLength(2);
    expect(grid.palette[0]?.r).toBeLessThan(grid.palette[1]?.r ?? 0);
  });

  it('is deterministic', () => {
    const samples: RGB[] = Array.from({ length: 30 }, (_, i) => ({
      r: (i * 37) % 256,
      g: (i * 53) % 256,
      b: (i * 91) % 256,
    }));
    const a = quantizeTexture(samples, 6, 5, 'floyd-steinberg');
    const b = quantizeTexture(samples, 6, 5, 'floyd-steinberg');
    expect(Array.from(a.indices)).toEqual(Array.from(b.indices));
    expect(a.palette).toEqual(b.palette);
  });
});

describe('generateTexturePattern', () => {
  it('produces correct K/P stitches accounting for RS/WS inversion', () => {
    // width=4, height=3, in IMAGE order. 1 = light (knit look), 0 = dark (purl bump look).
    const grid: Grid = {
      width: 4,
      height: 3,
      indices: Uint16Array.from([
        1,
        1,
        1,
        1, // top (image row 0)
        1,
        0,
        1,
        0, // middle (image row 1)
        0,
        1,
        1,
        1, // bottom (image row 2)
      ]),
      palette: [DARK, LIGHT],
    };

    const pattern = generateTexturePattern(grid);

    // Chart row 1 = bottom image row [0,1,1,1], RS, reversed -> [1,1,1,0]
    // RS: light->K, dark->P => K,K,K,P
    expect(pattern.rows[0]?.text).toBe('Row 1 (RS): K3, P1');

    // Chart row 2 = middle image row [1,0,1,0], WS, not reversed
    // WS: light->P, dark->K => P,K,P,K
    expect(pattern.rows[1]?.text).toBe('Row 2 (WS): P1, K1, P1, K1');

    // Chart row 3 = top image row [1,1,1,1], RS, reversed -> same
    // RS: light->K => K,K,K,K
    expect(pattern.rows[2]?.text).toBe('Row 3 (RS): K4');
  });

  it('treats a single-tone (uniform) grid as plain stockinette', () => {
    const grid: Grid = {
      width: 3,
      height: 2,
      indices: Uint16Array.from(new Array(6).fill(0)),
      palette: [LIGHT],
    };
    const pattern = generateTexturePattern(grid);
    expect(pattern.rows[0]?.text).toBe('Row 1 (RS): K3');
    expect(pattern.rows[1]?.text).toBe('Row 2 (WS): P3');
  });

  it('is deterministic across repeated calls', () => {
    const grid: Grid = {
      width: 10,
      height: 8,
      indices: Uint16Array.from(Array.from({ length: 80 }, (_, i) => (i * 3) % 2)),
      palette: [DARK, LIGHT],
    };
    const a = generateTexturePattern(grid);
    const b = generateTexturePattern(grid);
    expect(a.rows.map((r) => r.text)).toEqual(b.rows.map((r) => r.text));
  });
});

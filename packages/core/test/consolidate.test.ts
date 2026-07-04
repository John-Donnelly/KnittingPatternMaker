import { describe, expect, it } from 'vitest';
import { consolidatePalette, WOOL_SHADE_DELTA_E } from '../src/color/consolidate.js';
import { labDistanceSq, rgbToLab } from '../src/color/lab.js';
import { quantizeGrid } from '../src/image/quantizeGrid.js';
import type { RGB } from '../src/types.js';

const deltaE = (a: RGB, b: RGB) => Math.sqrt(labDistanceSq(rgbToLab(a), rgbToLab(b)));

describe('consolidatePalette', () => {
  it('merges near-identical shades into one wool color, keeping distinct colors', () => {
    const palette: RGB[] = [
      { r: 169, g: 201, b: 193 }, // three near-identical gray-greens (deltaE ~5-9 apart)
      { r: 177, g: 207, b: 190 },
      { r: 186, g: 209, b: 185 },
      { r: 200, g: 30, b: 30 }, // clearly distinct red
    ];
    const { palette: merged, remap } = consolidatePalette(palette, [10, 20, 30, 40]);

    expect(merged).toHaveLength(2);
    // The three gray-greens map to one entry; the red maps to the other.
    expect(new Set([remap[0], remap[1], remap[2]]).size).toBe(1);
    expect(remap[3]).not.toBe(remap[0]);
    // Every surviving pair is a genuinely different color.
    for (let i = 0; i < merged.length; i++) {
      for (let j = i + 1; j < merged.length; j++) {
        expect(deltaE(merged[i] as RGB, merged[j] as RGB)).toBeGreaterThanOrEqual(
          WOOL_SHADE_DELTA_E,
        );
      }
    }
  });

  it('weights the merged color toward the shade that covers more stitches', () => {
    const dominant: RGB = { r: 100, g: 100, b: 100 };
    const minor: RGB = { r: 110, g: 110, b: 110 };
    const { palette } = consolidatePalette([dominant, minor], [990, 10]);
    expect(palette).toHaveLength(1);
    const mergedColor = palette[0] as RGB;
    // 99% weight on the dominant shade: result stays within 1 unit of it.
    expect(Math.abs(mergedColor.r - dominant.r)).toBeLessThanOrEqual(1);
  });

  it('merges transitively (a chain of near shades collapses together)', () => {
    // Each neighbor ~6 deltaE apart; ends ~12 apart — still one group via the chain.
    const chain: RGB[] = [
      { r: 100, g: 100, b: 100 },
      { r: 112, g: 112, b: 112 },
      { r: 124, g: 124, b: 124 },
    ];
    const { palette } = consolidatePalette(chain, [1, 1, 1]);
    expect(palette).toHaveLength(1);
  });

  it('leaves an already-distinct palette untouched (same colors, luminance order)', () => {
    const palette: RGB[] = [
      { r: 10, g: 10, b: 10 },
      { r: 200, g: 30, b: 30 },
      { r: 245, g: 245, b: 245 },
    ];
    const { palette: merged, remap } = consolidatePalette(palette, [5, 5, 5]);
    expect(merged).toEqual(palette);
    expect(remap).toEqual([0, 1, 2]);
  });

  it('is deterministic', () => {
    const palette: RGB[] = [
      { r: 169, g: 201, b: 193 },
      { r: 177, g: 207, b: 190 },
      { r: 60, g: 161, b: 50 },
    ];
    expect(consolidatePalette(palette, [3, 2, 1])).toEqual(consolidatePalette(palette, [3, 2, 1]));
  });
});

describe('quantizeGrid wool-color consolidation', () => {
  it('never returns two palette entries a single shade apart, even on smooth gradients', () => {
    // A soft sky-like gradient that median-cut would otherwise split into near-identical
    // shades when given generous maxColors.
    const width = 60;
    const height = 60;
    const samples: RGB[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const t = y / (height - 1);
        samples.push({
          r: Math.round(150 + t * 40),
          g: Math.round(190 + t * 20),
          b: Math.round(200 - t * 15),
        });
      }
    }
    const grid = quantizeGrid(samples, width, height, { maxColors: 8, dither: 'none' });

    for (let i = 0; i < grid.palette.length; i++) {
      for (let j = i + 1; j < grid.palette.length; j++) {
        expect(deltaE(grid.palette[i] as RGB, grid.palette[j] as RGB)).toBeGreaterThanOrEqual(
          WOOL_SHADE_DELTA_E,
        );
      }
    }
    // Indices all reference the consolidated palette.
    for (const idx of grid.indices) {
      expect(idx).toBeLessThan(grid.palette.length);
    }
  });

  it('shadeMergeDeltaE: 0 disables merging; a custom threshold widens it', () => {
    // Two shades ~deltaE 5 apart, in equal amounts.
    const A = { r: 169, g: 201, b: 193 };
    const B = { r: 177, g: 207, b: 190 };
    const samples: RGB[] = [];
    for (let i = 0; i < 100; i++) samples.push(i % 2 === 0 ? A : B);

    const off = quantizeGrid(samples, 10, 10, {
      maxColors: 4,
      dither: 'none',
      shadeMergeDeltaE: 0,
    });
    expect(off.palette).toHaveLength(2);

    const defaulted = quantizeGrid(samples, 10, 10, { maxColors: 4, dither: 'none' });
    expect(defaulted.palette).toHaveLength(1);

    // Distinctly different grays (~deltaE 17 apart) survive the default but merge at 25.
    const C = { r: 100, g: 100, b: 100 };
    const D = { r: 140, g: 140, b: 140 };
    const grays: RGB[] = [];
    for (let i = 0; i < 100; i++) grays.push(i % 2 === 0 ? C : D);
    expect(quantizeGrid(grays, 10, 10, { maxColors: 4, dither: 'none' }).palette.length).toBe(2);
    expect(
      quantizeGrid(grays, 10, 10, { maxColors: 4, dither: 'none', shadeMergeDeltaE: 25 }).palette
        .length,
    ).toBe(1);
  });

  it('keeps genuinely distinct flat colors intact', () => {
    const samples: RGB[] = [];
    const RED = { r: 200, g: 30, b: 30 };
    const WHITE = { r: 245, g: 245, b: 245 };
    for (let i = 0; i < 100; i++) samples.push(i % 2 === 0 ? RED : WHITE);
    const grid = quantizeGrid(samples, 10, 10, { maxColors: 4, dither: 'none' });
    expect(grid.palette).toHaveLength(2);
    expect(grid.palette).toContainEqual(RED);
    expect(grid.palette).toContainEqual(WHITE);
  });
});

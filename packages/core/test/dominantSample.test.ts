import { describe, expect, it } from 'vitest';
import { pixelateDominant } from '../src/image/dominantSample.js';
import { pixelate } from '../src/image/pixelate.js';
import { sampleImage } from '../src/image/sample.js';
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

const full = (w: number, h: number) => ({ x: 0, y: 0, width: w, height: h });

describe('pixelateDominant', () => {
  it('recovers the flat cell color, rejecting a minority grid line that averaging would muddy', () => {
    // 5x1 white cell with a single gray "grid line" pixel. Averaging drags the result toward
    // gray; the dominant bucket is white and stays white.
    const source = makeBuffer(5, 1, (x) => (x === 2 ? [128, 128, 128] : [250, 250, 250]));

    const dominant = pixelateDominant(source, full(5, 1), 1, 1);
    expect(dominant[0]).toEqual({ r: 250, g: 250, b: 250 });

    const averaged = pixelate(source, full(5, 1), 1, 1);
    expect(averaged[0]!.r).toBeLessThan(250); // averaging muddied it
    expect(averaged[0]!.r).toBeGreaterThan(128);
  });

  it("groups JPEG-style jitter within a bucket and returns that bucket's true mean", () => {
    // A "flat" green that JPEG jitter has spread across 100..107 (all in the same 16-wide
    // bucket for the green channel). Dominant returns the mean of those, not a bucket center.
    const greens: [number, number, number][] = [
      [20, 100, 30],
      [21, 101, 31],
      [19, 102, 29],
      [20, 103, 30],
    ];
    const source = makeBuffer(4, 1, (x) => greens[x]!);
    const [cell] = pixelateDominant(source, full(4, 1), 1, 1);
    expect(cell).toEqual({ r: 20, g: 102, b: 30 }); // mean rounded
  });

  it('returns the exact color for a solid-color cell', () => {
    const source = makeBuffer(6, 6, () => [42, 84, 126]);
    const cells = pixelateDominant(source, full(6, 6), 3, 3);
    for (const c of cells) expect(c).toEqual({ r: 42, g: 84, b: 126 });
  });

  it('breaks an exact tie by the lowest bucket key, deterministically', () => {
    // Two colors, one pixel each: dark red (bucket key smaller) vs bright green.
    const colors: [number, number, number][] = [
      [16, 0, 0],
      [0, 240, 0],
    ];
    const source = makeBuffer(2, 1, (x) => colors[x]!);
    const [cell] = pixelateDominant(source, full(2, 1), 1, 1);
    // Red bucket key = (1<<16) = 65536; green key = (15<<8) = 3840. Green key is lower, wins.
    expect(cell).toEqual({ r: 0, g: 240, b: 0 });
  });

  it('separates a real chart cell (flat green) from its gray gridlines', () => {
    // 8x8 source: a flat green cell bordered by a 1px gray grid on the right and bottom edges.
    // Sampled 1:1 into a single cell, the green (36 px) dominates the gray (15 px).
    const source = makeBuffer(8, 8, (x, y) =>
      x === 7 || y === 7 ? [110, 110, 110] : [70, 130, 80],
    );
    const [cell] = pixelateDominant(source, full(8, 8), 1, 1);
    expect(cell).toEqual({ r: 70, g: 130, b: 80 });
  });

  it('is deterministic across repeated calls', () => {
    const source = makeBuffer(40, 30, (x, y) => [(x * 7) % 256, (y * 13) % 256, (x + y) % 256]);
    const a = pixelateDominant(source, { x: 3, y: 2, width: 30, height: 25 }, 12, 10);
    const b = pixelateDominant(source, { x: 3, y: 2, width: 30, height: 25 }, 12, 10);
    expect(a).toEqual(b);
  });

  it('partitions cells identically to pixelate (same boundary math)', () => {
    // On a source where each cell is a single solid color, dominant and average must agree,
    // proving both samplers cover the exact same source pixels per cell.
    const source = makeBuffer(6, 4, (x, y) => [x * 40, y * 60, 0]);
    const dominant = pixelateDominant(source, full(6, 4), 6, 4);
    const averaged = pixelate(source, full(6, 4), 6, 4);
    expect(dominant).toEqual(averaged);
  });

  it('throws for non-positive grid dimensions', () => {
    const source = makeBuffer(4, 4, () => [0, 0, 0]);
    expect(() => pixelateDominant(source, full(4, 4), 0, 2)).toThrow();
  });
});

describe('sampleImage', () => {
  it('dispatches to the averaging sampler for mode "average"', () => {
    const source = makeBuffer(5, 1, (x) => (x === 2 ? [128, 128, 128] : [250, 250, 250]));
    expect(sampleImage(source, full(5, 1), 1, 1, 'average')).toEqual(
      pixelate(source, full(5, 1), 1, 1),
    );
  });

  it('dispatches to the dominant sampler for mode "dominant"', () => {
    const source = makeBuffer(5, 1, (x) => (x === 2 ? [128, 128, 128] : [250, 250, 250]));
    expect(sampleImage(source, full(5, 1), 1, 1, 'dominant')).toEqual(
      pixelateDominant(source, full(5, 1), 1, 1),
    );
  });
});

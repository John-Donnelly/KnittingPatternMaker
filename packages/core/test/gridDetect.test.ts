import { describe, expect, it } from 'vitest';
import { detectChartGrid } from '../src/auto/gridDetect.js';
import { resolveAutoOptions } from '../src/auto/autoSettings.js';
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

/** A cellsX x cellsY chart at cellPx px/cell: green/white checkerboard behind a gray grid. */
function griddedChart(cellsX: number, cellsY: number, cellPx: number): PixelBuffer {
  return makeBuffer(cellsX * cellPx, cellsY * cellPx, (x, y) => {
    const onGrid = x % cellPx === cellPx - 1 || y % cellPx === cellPx - 1;
    if (onGrid) return [120, 120, 120];
    const cellX = Math.floor(x / cellPx);
    const cellY = Math.floor(y / cellPx);
    return (cellX + cellY) % 2 === 0 ? [30, 120, 40] : [245, 245, 245];
  });
}

describe('detectChartGrid', () => {
  it('detects the cell grid of a chart image with grid lines', () => {
    const detection = detectChartGrid(griddedChart(20, 24, 12));
    expect(detection).not.toBeNull();
    // Outermost lines may or may not be detected — allow one cell of slack per axis.
    expect(detection?.cellsAcross).toBeGreaterThanOrEqual(19);
    expect(detection?.cellsAcross).toBeLessThanOrEqual(21);
    expect(detection?.cellsDown).toBeGreaterThanOrEqual(23);
    expect(detection?.cellsDown).toBeLessThanOrEqual(25);
  });

  it('returns null for a smooth photo-like gradient', () => {
    const photo = makeBuffer(200, 200, (x, y) => [
      Math.round((x / 199) * 255),
      Math.round((y / 199) * 255),
      128,
    ]);
    expect(detectChartGrid(photo)).toBeNull();
  });

  it('returns null for flat art without grid lines', () => {
    const quadrants = makeBuffer(200, 200, (x, y) => {
      if (y < 100) return x < 100 ? [200, 30, 30] : [245, 245, 245];
      return x < 100 ? [30, 60, 200] : [30, 160, 60];
    });
    expect(detectChartGrid(quadrants)).toBeNull();
  });

  it('is deterministic', () => {
    const chart = griddedChart(16, 16, 10);
    expect(detectChartGrid(chart)).toEqual(detectChartGrid(chart));
  });
});

describe('auto mode on a picture of an existing chart', () => {
  it('maps one stitch per chart cell with dominant sampling and an aligned crop', () => {
    const { options, decisions } = resolveAutoOptions(griddedChart(20, 24, 12), {});
    expect(options.sampling).toBe('dominant');
    expect(options.widthStitches).toBeGreaterThanOrEqual(19);
    expect(options.widthStitches).toBeLessThanOrEqual(21);
    expect(options.heightRows).toBeGreaterThanOrEqual(23);
    expect(options.heightRows).toBeLessThanOrEqual(25);
    expect(options.crop).toBeDefined();
    expect(decisions.some((d) => d.reason.includes('existing chart'))).toBe(true);
  });

  it('respects user-provided dimensions over the detected grid', () => {
    const { options } = resolveAutoOptions(griddedChart(20, 24, 12), {
      widthStitches: 10,
      heightRows: 10,
    });
    expect(options.widthStitches).toBe(10);
    expect(options.heightRows).toBe(10);
  });
});

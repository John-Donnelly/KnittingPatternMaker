import { describe, expect, it } from 'vitest';
import { computeChartLayout } from '../src/chartLayout.js';

describe('computeChartLayout', () => {
  it('produces integer device-pixel cells and a CSS size of exactly canvas/dpr', () => {
    for (const dpr of [1, 1.25, 1.5, 2, 3]) {
      for (const [w, h] of [
        [40, 40],
        [55, 56],
        [200, 260],
        [400, 400],
      ] as const) {
        const layout = computeChartLayout(w, h, 30 / 22, 640, dpr);
        expect(Number.isInteger(layout.cellW)).toBe(true);
        expect(Number.isInteger(layout.cellH)).toBe(true);
        expect(layout.cellW).toBeGreaterThanOrEqual(1);
        expect(layout.cellH).toBeGreaterThanOrEqual(1);
        expect(layout.canvasW).toBe(layout.cellW * w);
        expect(layout.canvasH).toBe(layout.cellH * h);
        expect(layout.cssW).toBeCloseTo(layout.canvasW / Math.max(1, dpr), 10);
      }
    }
  });

  it('keeps the CSS width within the container whenever 1px cells fit', () => {
    const layout = computeChartLayout(300, 300, 30 / 22, 600, 2);
    expect(layout.cssW).toBeLessThanOrEqual(600);
  });

  it('disables grid lines when cells get too small to read', () => {
    const large = computeChartLayout(400, 400, 30 / 22, 640, 1);
    expect(large.drawGridLines).toBe(false);
    const small = computeChartLayout(30, 30, 30 / 22, 640, 1);
    expect(small.drawGridLines).toBe(true);
  });

  it('scales the grid-line threshold with device pixel ratio', () => {
    // Same chart: readable cells at dpr 1 must still be readable at dpr 2 (threshold is CSS px).
    const at1 = computeChartLayout(60, 60, 30 / 22, 640, 1);
    const at2 = computeChartLayout(60, 60, 30 / 22, 640, 2);
    expect(at1.drawGridLines).toBe(at2.drawGridLines);
  });
});

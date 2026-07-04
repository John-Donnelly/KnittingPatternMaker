import type { Grid } from 'knitting-pattern-core';
import { encodePng } from './pngEncode.js';

/**
 * Chart PNG renderer for Workers — same layout constants and deterministic output shape as
 * apps/api/src/export/png.ts (the Node/pngjs version), just writing through the pure PNG
 * encoder. Keep the two in sync when changing chart appearance.
 */

const MAX_IMAGE_DIMENSION_PX = 2400;
const MAX_CELL_SIZE_PX = 24;
const MIN_CELL_SIZE_PX = 4;
const GRID_LINE_MIN_CELL_SIZE_PX = 6;
const MAJOR_GRID_LINE_EVERY = 10;

const GRID_LINE_COLOR = { r: 160, g: 160, b: 160 };
const MAJOR_GRID_LINE_COLOR = { r: 90, g: 90, b: 90 };

function chartCellSizePx(grid: Grid): number {
  const largestDimension = Math.max(grid.width, grid.height);
  const fitted = Math.floor(MAX_IMAGE_DIMENSION_PX / largestDimension);
  return Math.max(MIN_CELL_SIZE_PX, Math.min(MAX_CELL_SIZE_PX, fitted));
}

export function renderChartPng(grid: Grid): Uint8Array {
  const cellSize = chartCellSizePx(grid);
  const width = grid.width * cellSize;
  const height = grid.height * cellSize;
  const rgba = new Uint8Array(width * height * 4);

  const setPixel = (x: number, y: number, c: { r: number; g: number; b: number }) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (width * y + x) * 4;
    rgba[i] = c.r;
    rgba[i + 1] = c.g;
    rgba[i + 2] = c.b;
    rgba[i + 3] = 255;
  };

  for (let gy = 0; gy < grid.height; gy++) {
    for (let gx = 0; gx < grid.width; gx++) {
      const paletteIndex = grid.indices[gy * grid.width + gx] ?? 0;
      const color = grid.palette[paletteIndex] ?? { r: 255, g: 255, b: 255 };
      for (let py = 0; py < cellSize; py++) {
        for (let px = 0; px < cellSize; px++) {
          setPixel(gx * cellSize + px, gy * cellSize + py, color);
        }
      }
    }
  }

  if (cellSize >= GRID_LINE_MIN_CELL_SIZE_PX) {
    for (let gx = 0; gx <= grid.width; gx++) {
      const color = gx % MAJOR_GRID_LINE_EVERY === 0 ? MAJOR_GRID_LINE_COLOR : GRID_LINE_COLOR;
      for (let py = 0; py < height; py++) setPixel(gx * cellSize, py, color);
    }
    for (let gy = 0; gy <= grid.height; gy++) {
      const color = gy % MAJOR_GRID_LINE_EVERY === 0 ? MAJOR_GRID_LINE_COLOR : GRID_LINE_COLOR;
      for (let px = 0; px < width; px++) setPixel(px, gy * cellSize, color);
    }
  }

  return encodePng(width, height, rgba);
}

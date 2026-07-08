import { PNG } from 'pngjs';
import type { Grid } from 'knitting-pattern-core';

const MAX_IMAGE_DIMENSION_PX = 2400;
const MAX_CELL_SIZE_PX = 24;
const GRID_LINE_MIN_CELL_SIZE_PX = 6;
const MAJOR_GRID_LINE_EVERY = 10;

const GRID_LINE_COLOR = { r: 160, g: 160, b: 160 };
const MAJOR_GRID_LINE_COLOR = { r: 90, g: 90, b: 90 };

function chartCellSizePx(grid: Grid): number {
  const largestDimension = Math.max(grid.width, grid.height);
  // Floor of 1 (not a larger minimum) so MAX_IMAGE_DIMENSION_PX is a *hard* cap on output size
  // and memory at any grid dimension. Large charts get small cells (no gridlines); the PDF is
  // the detailed printable artifact.
  const fitted = Math.floor(MAX_IMAGE_DIMENSION_PX / largestDimension);
  return Math.max(1, Math.min(MAX_CELL_SIZE_PX, fitted));
}

function setPixel(
  png: PNG,
  x: number,
  y: number,
  color: { r: number; g: number; b: number },
): void {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const idx = (png.width * y + x) << 2;
  png.data[idx] = color.r;
  png.data[idx + 1] = color.g;
  png.data[idx + 2] = color.b;
  png.data[idx + 3] = 255;
}

/**
 * Renders the stitch grid as a standard square-cell colorwork chart PNG (one square per
 * stitch, in image top-to-bottom orientation — matching the picture, not knitting order).
 * Cell size is deterministically derived from the grid dimensions and capped so output stays
 * a bounded, reasonable file size at any supported grid size.
 */
export function renderChartPng(grid: Grid): Buffer {
  const cellSize = chartCellSizePx(grid);
  const width = grid.width * cellSize;
  const height = grid.height * cellSize;
  const png = new PNG({ width, height });

  for (let gy = 0; gy < grid.height; gy++) {
    for (let gx = 0; gx < grid.width; gx++) {
      const paletteIndex = grid.indices[gy * grid.width + gx] ?? 0;
      const color = grid.palette[paletteIndex] ?? { r: 255, g: 255, b: 255 };
      for (let py = 0; py < cellSize; py++) {
        for (let px = 0; px < cellSize; px++) {
          setPixel(png, gx * cellSize + px, gy * cellSize + py, color);
        }
      }
    }
  }

  if (cellSize >= GRID_LINE_MIN_CELL_SIZE_PX) {
    for (let gx = 0; gx <= grid.width; gx++) {
      const color = gx % MAJOR_GRID_LINE_EVERY === 0 ? MAJOR_GRID_LINE_COLOR : GRID_LINE_COLOR;
      for (let py = 0; py < height; py++) {
        setPixel(png, gx * cellSize, py, color);
      }
    }
    for (let gy = 0; gy <= grid.height; gy++) {
      const color = gy % MAJOR_GRID_LINE_EVERY === 0 ? MAJOR_GRID_LINE_COLOR : GRID_LINE_COLOR;
      for (let px = 0; px < width; px++) {
        setPixel(png, px, gy * cellSize, color);
      }
    }
  }

  return PNG.sync.write(png);
}

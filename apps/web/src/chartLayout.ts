/**
 * Device-pixel-exact chart layout. The canvas backing store is sized in *device* pixels and
 * its CSS size is set to exactly backing/dpr, so the browser never resamples the bitmap —
 * resampling a chart at a non-integer ratio produces moire banding that reads as spurious
 * grid lines, which is exactly what large charts showed before this existed.
 */
export interface ChartLayout {
  /** Integer device-pixel cell size. */
  cellW: number;
  cellH: number;
  /** Canvas backing-store size in device pixels. */
  canvasW: number;
  canvasH: number;
  /** CSS size (px) — exactly canvas / dpr, guaranteed <= the container width. */
  cssW: number;
  cssH: number;
  /** Whether cells are big enough to draw grid lines legibly. */
  drawGridLines: boolean;
}

const MAX_CELL_CSS_PX = 28;
const GRID_LINE_MIN_CELL_CSS_PX = 6;
const MAX_DISPLAY_CSS_HEIGHT = 640;

export function computeChartLayout(
  gridWidth: number,
  gridHeight: number,
  stitchAspect: number,
  containerCssWidth: number,
  devicePixelRatio: number,
): ChartLayout {
  const dpr = Math.max(1, devicePixelRatio);
  const budgetW = Math.max(1, Math.floor(containerCssWidth * dpr));
  const budgetH = Math.max(1, Math.floor(MAX_DISPLAY_CSS_HEIGHT * dpr));

  // Integer device-pixel cell height fitting both axes; width follows the stitch aspect.
  const cellH = Math.max(
    1,
    Math.min(
      Math.floor(MAX_CELL_CSS_PX * dpr),
      Math.floor(budgetH / gridHeight),
      Math.floor(budgetW / (gridWidth * stitchAspect)),
    ),
  );
  const cellW = Math.max(1, Math.round(cellH * stitchAspect));

  // If even 1px-wide cells overflow the container, the canvas is still built at integer
  // cells and CSS-capped by max-width; image-rendering: pixelated keeps that case moire-free.
  const canvasW = cellW * gridWidth;
  const canvasH = cellH * gridHeight;

  return {
    cellW,
    cellH,
    canvasW,
    canvasH,
    cssW: canvasW / dpr,
    cssH: canvasH / dpr,
    drawGridLines: cellH >= GRID_LINE_MIN_CELL_CSS_PX * dpr,
  };
}

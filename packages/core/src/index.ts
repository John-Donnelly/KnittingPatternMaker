export const CORE_VERSION = '0.1.0';

export * from './types.js';

export { rgbToLab, labDistanceSq, relativeLuminance } from './color/lab.js';
export type { Lab } from './color/lab.js';
export { medianCutPalette } from './color/quantize.js';
export { nearestColorIndex } from './color/nearest.js';

export { pixelate } from './image/pixelate.js';
export { ditherBayer4, ditherFloydSteinberg } from './image/dither.js';
export { quantizeGrid } from './image/quantizeGrid.js';
export {
  DEFAULT_GAUGE,
  stitchAspectRatio,
  finishedSize,
  suggestedCropRect,
} from './image/gauge.js';
export type { FinishedSize } from './image/gauge.js';

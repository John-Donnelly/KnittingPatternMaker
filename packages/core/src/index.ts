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

export { chartRowToGridRow, isRightSideRow, toKnittingOrder } from './pattern/chartOrder.js';
export { runLengthEncode } from './pattern/runLength.js';
export type { Run } from './pattern/runLength.js';
export { paletteLabel } from './pattern/paletteLabels.js';

export {
  generateStrandedPattern,
  FLOAT_CATCH_THRESHOLD_STITCHES,
  STRANDED_RECOMMENDED_MAX_COLORS_PER_ROW,
} from './pattern/strandedColorwork.js';
export type {
  StrandedColorworkPattern,
  ColorworkRowInstruction,
  FloatWarning,
  ManyColorRowWarning,
} from './pattern/strandedColorwork.js';

export { generateIntarsiaPattern } from './pattern/intarsia.js';
export type { IntarsiaPattern, IntarsiaBlock } from './pattern/intarsia.js';

export { generateTexturePattern, quantizeTexture } from './pattern/textureKnitPurl.js';
export type { TexturePattern, TextureRowInstruction, Stitch } from './pattern/textureKnitPurl.js';

export { estimateYardage, YARDAGE_ROUGH_MULTIPLIER } from './pattern/yarnEstimate.js';
export type { YardageEstimate, ColorYardageEstimate } from './pattern/yarnEstimate.js';

export { encodePatternSpec, decodePatternSpec } from './pattern/shareState.js';
export type { PatternSpec } from './pattern/shareState.js';

export { encodeBase64Url, decodeBase64Url } from './pattern/base64url.js';

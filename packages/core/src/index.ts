export const CORE_VERSION = '0.1.0';

export * from './types.js';
export { MAX_GRID_DIMENSION, MAX_COLORS, MAX_SHARE_LINK_LENGTH } from './limits.js';

export { rgbToLab, labDistanceSq, relativeLuminance } from './color/lab.js';
export type { Lab } from './color/lab.js';
export { medianCutPalette } from './color/quantize.js';
export { adaptivePalette } from './color/refine.js';
export { consolidatePalette, WOOL_SHADE_DELTA_E } from './color/consolidate.js';
export type { ConsolidatedPalette } from './color/consolidate.js';
export { nearestColorIndex } from './color/nearest.js';

export { pixelate } from './image/pixelate.js';
export { pixelateDominant } from './image/dominantSample.js';
export { sampleImage } from './image/sample.js';
export { ditherBayer4, ditherFloydSteinberg } from './image/dither.js';
export { quantizeGrid } from './image/quantizeGrid.js';
export { makeSeamless, seamlessModeToOptions } from './image/seamless.js';
export { quiltSeamless, quiltOverlap } from './image/quilt.js';
export type { SeamlessOptions } from './image/seamless.js';
export { tileGrid } from './image/tileGrid.js';
export {
  DEFAULT_GAUGE,
  stitchAspectRatio,
  finishedSize,
  suggestedCropRect,
} from './image/gauge.js';
export type { FinishedSize } from './image/gauge.js';

export { analyzeImage } from './auto/imageStats.js';
export type { ImageStats } from './auto/imageStats.js';
export {
  resolveAutoOptions,
  AUTO_TARGET_FINISHED_WIDTH_IN,
  AUTO_MIN_DIMENSION,
  AUTO_NATIVE_PIXEL_ART_MAX,
  AUTO_STRANDED_MAX_PALETTE,
  AUTO_INTARSIA_MAX_PALETTE,
  AUTO_STRANDED_MAX_BUSY_ROW_FRACTION,
  AUTO_INTARSIA_MAX_YARN_ENDS_PER_ROW,
} from './auto/autoSettings.js';
export type {
  AutoPatternRequest,
  ResolvedPatternOptions,
  AutoDecision,
  AutoResolution,
} from './auto/autoSettings.js';

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

export { serializeGrid, deserializeGrid, serializeNumberMap } from './pattern/gridJson.js';
export type { GridJson } from './pattern/gridJson.js';

export { applyColorEdits, despeckleGrid, isIdentityEdits } from './pattern/colorEdits.js';
export type { ColorEdit } from './pattern/colorEdits.js';

export { buildPatternResult, buildYardageEstimate } from './pattern/patternResult.js';
export type {
  PatternResultJson,
  StrandedPatternJson,
  IntarsiaPatternJson,
  TexturePatternJson,
} from './pattern/patternResult.js';

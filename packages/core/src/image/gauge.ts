import type { CropRect, GaugeSpec, PatternDimensions } from '../types.js';

/**
 * Default gauge assumed when the user doesn't supply one: approximates a common worsted-weight
 * stockinette tension (~5.5 sts/in, ~7.5 rows/in). Knit stitches are wider than they are tall,
 * so this default still applies an aspect correction rather than pretending stitches are square.
 */
export const DEFAULT_GAUGE: GaugeSpec = {
  stitchesPer4In: 22,
  rowsPer4In: 30,
};

/** Width:height ratio of a single stitch cell (>1 means stitches are wider than tall). */
export function stitchAspectRatio(gauge: GaugeSpec = DEFAULT_GAUGE): number {
  if (gauge.stitchesPer4In <= 0 || gauge.rowsPer4In <= 0) {
    throw new Error('Gauge stitch/row counts must be positive');
  }
  const stitchWidth = 4 / gauge.stitchesPer4In;
  const stitchHeight = 4 / gauge.rowsPer4In;
  return stitchWidth / stitchHeight;
}

export interface FinishedSize {
  widthIn: number;
  heightIn: number;
}

/** Estimated finished dimensions in inches for a given stitch grid size and gauge. */
export function finishedSize(
  dims: Required<Pick<PatternDimensions, 'widthStitches' | 'heightRows'>>,
  gauge: GaugeSpec = DEFAULT_GAUGE,
): FinishedSize {
  return {
    widthIn: (dims.widthStitches / gauge.stitchesPer4In) * 4,
    heightIn: (dims.heightRows / gauge.rowsPer4In) * 4,
  };
}

/**
 * Largest centered crop rectangle of the source image whose aspect ratio matches what the
 * requested stitch grid will actually look like once knitted (accounting for non-square
 * stitches). Used as the default crop offered to the user before pixelation; the user may
 * override it with an explicit CropRect.
 */
export function suggestedCropRect(
  sourceWidth: number,
  sourceHeight: number,
  widthStitches: number,
  heightRows: number,
  gauge: GaugeSpec = DEFAULT_GAUGE,
): CropRect {
  if (sourceWidth < 1 || sourceHeight < 1) {
    throw new Error('Source image dimensions must be positive');
  }
  if (widthStitches < 1 || heightRows < 1) {
    throw new Error('Grid dimensions must be positive');
  }

  const cellAspect = stitchAspectRatio(gauge);
  // Physical aspect of the requested grid once knitted (width:height).
  const targetAspect = (widthStitches * cellAspect) / heightRows;
  const sourceAspect = sourceWidth / sourceHeight;

  let cropWidth: number;
  let cropHeight: number;
  if (targetAspect > sourceAspect) {
    // Target is relatively wider than the source: use the full width, crop height.
    cropWidth = sourceWidth;
    cropHeight = Math.max(1, Math.round(sourceWidth / targetAspect));
  } else {
    cropHeight = sourceHeight;
    cropWidth = Math.max(1, Math.round(sourceHeight * targetAspect));
  }

  cropWidth = Math.min(cropWidth, sourceWidth);
  cropHeight = Math.min(cropHeight, sourceHeight);

  return {
    x: Math.floor((sourceWidth - cropWidth) / 2),
    y: Math.floor((sourceHeight - cropHeight) / 2),
    width: cropWidth,
    height: cropHeight,
  };
}

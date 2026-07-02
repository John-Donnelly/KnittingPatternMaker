/** An integer sRGB color, each channel in [0, 255]. */
export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** A raw RGBA pixel buffer, compatible with both browser `ImageData` and a Node raw decode. */
export interface PixelBuffer {
  width: number;
  height: number;
  /** Row-major, top-to-bottom, 4 bytes per pixel (R, G, B, A). Length must equal width*height*4. */
  data: Uint8ClampedArray;
}

/** An axis-aligned crop region in source-pixel coordinates (integers, top-left origin). */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A quantized stitch grid: one palette index per stitch, row-major, row 0 = top of the chart. */
export interface Grid {
  width: number;
  height: number;
  /** Row-major palette index per cell, length width*height. */
  indices: Uint16Array;
  palette: RGB[];
}

export type DitherMode = 'none' | 'bayer4' | 'floyd-steinberg';

/**
 * How each output cell's color is drawn from the source pixels it covers.
 * - `average`: box-filter mean of every covered pixel — best for photos and smooth gradients.
 * - `dominant`: modal color of the cell, rejecting outlier pixels (grid lines, JPEG ringing,
 *   anti-aliased edges) — best for extracting crisp pixel art from a chart/logo/screenshot.
 */
export type SamplingMode = 'average' | 'dominant';

/** Which axes to make tileable so a repeated motif loops with no visible seam. */
export type SeamlessMode = 'none' | 'horizontal' | 'vertical' | 'both';

/** How many times to repeat (tile) the motif into the final chart. 1x1 = a single motif. */
export interface RepeatSpec {
  across: number;
  down: number;
}

export interface QuantizeOptions {
  /** Maximum number of distinct colors in the resulting palette (>= 1). */
  maxColors: number;
  dither: DitherMode;
}

/**
 * A knitting gauge: how many stitches/rows make up 4in (10cm) of fabric at a given tension.
 * Used only to correct the visual aspect ratio of the pixel grid to what will actually be
 * knitted (stitches are never perfectly square) and to estimate finished dimensions.
 */
export interface GaugeSpec {
  stitchesPer4In: number;
  rowsPer4In: number;
}

export type Technique = 'stranded' | 'intarsia' | 'texture';

export interface PatternDimensions {
  widthStitches: number;
  heightRows: number;
  gauge?: GaugeSpec;
}

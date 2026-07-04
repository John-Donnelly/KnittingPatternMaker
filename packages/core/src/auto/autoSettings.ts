import type {
  CropRect,
  DitherMode,
  GaugeSpec,
  Grid,
  PixelBuffer,
  RepeatSpec,
  SamplingMode,
  SeamlessMode,
  Technique,
} from '../types.js';
import { MAX_GRID_DIMENSION } from '../limits.js';
import { DEFAULT_GAUGE, stitchAspectRatio, suggestedCropRect } from '../image/gauge.js';
import { sampleImage } from '../image/sample.js';
import { quantizeGrid } from '../image/quantizeGrid.js';
import { WOOL_SHADE_DELTA_E } from '../color/consolidate.js';
import { analyzeImage, type ImageStats } from './imageStats.js';
import { detectChartGrid, detectPixelLattice, type ChartGridDetection } from './gridDetect.js';

/**
 * Auto mode: fill in any pattern option the user left unset with a choice derived
 * deterministically from the image itself, conforming to common colorwork practice.
 *
 * The constants below are grounded in published conventions (sources in
 * docs/KNITTING_NOTES.md, "Auto mode"): traditional Fair Isle uses 2 colors per row and a
 * 4-5 color total palette; intarsia becomes hard to manage past ~10 simultaneous bobbins;
 * chart tools default to ~48-100 stitch widths (knitPro's "Regular" grid is 48x64); and
 * dithering is recommended OFF for colorwork.
 *
 * There is deliberately no ML here: every choice is validated against the *actual* quantized
 * stitch grid (per-row color counts, yarn ends per row) using the same pure functions the
 * final pattern is built from, so auto mode is exactly as deterministic and testable as the
 * rest of the pipeline.
 */

/** Every pattern option, all optional — anything unset is chosen by auto mode. */
export interface AutoPatternRequest {
  technique?: Technique | undefined;
  widthStitches?: number | undefined;
  heightRows?: number | undefined;
  gauge?: GaugeSpec | undefined;
  maxColors?: number | undefined;
  dither?: DitherMode | undefined;
  sampling?: SamplingMode | undefined;
  crop?: CropRect | undefined;
  seamless?: SeamlessMode | undefined;
  repeat?: RepeatSpec | undefined;
  /** Wool-color grouping threshold (CIE76 delta-E); 0 keeps every shade. */
  shadeMergeDeltaE?: number | undefined;
}

/** The concrete options auto mode resolved to (crop/gauge stay optional: unset means
 * "suggested crop" / "assume the default gauge for proportions only"). */
export interface ResolvedPatternOptions {
  technique: Technique;
  widthStitches: number;
  heightRows: number;
  gauge?: GaugeSpec;
  maxColors: number;
  dither: DitherMode;
  sampling: SamplingMode;
  crop?: CropRect;
  seamless: SeamlessMode;
  repeat: RepeatSpec;
  /** Wool-color grouping threshold actually used (CIE76 delta-E); 0 = disabled. */
  shadeMergeDeltaE: number;
}

/** One auto-mode choice, with a human-readable reason (shown in the UI). */
export interface AutoDecision {
  field: string;
  value: string;
  reason: string;
}

export interface AutoResolution {
  options: ResolvedPatternOptions;
  /** Choices auto mode made (only for fields the user left unset). */
  decisions: AutoDecision[];
  stats: ImageStats;
}

/** Default finished chart width to aim for, in inches (~popular tools' 48-100 st defaults). */
export const AUTO_TARGET_FINISHED_WIDTH_IN = 10;
/** Smallest auto-chosen motif side — below this a picture stops reading as a picture. */
export const AUTO_MIN_DIMENSION = 16;
/** Flat-art sources up to this many pixels per side are mapped 1 stitch per pixel. */
export const AUTO_NATIVE_PIXEL_ART_MAX = 120;
/** Traditional Fair Isle palettes run 4-5 colors total. */
export const AUTO_STRANDED_MAX_PALETTE = 5;
/** Intarsia palettes stay practical well past stranded's, bounded by bobbin management. */
export const AUTO_INTARSIA_MAX_PALETTE = 10;
/** Rows allowed to exceed 2 colors (as a fraction) before stranded stops being the pick. */
export const AUTO_STRANDED_MAX_BUSY_ROW_FRACTION = 0.25;
/** Max simultaneous yarn ends (color runs) in any single row for intarsia to stay practical. */
export const AUTO_INTARSIA_MAX_YARN_ENDS_PER_ROW = 10;

/**
 * Resolves a partial options request into concrete pattern options. Fields the user set are
 * passed through untouched; unset fields are chosen from the image and recorded in
 * `decisions` with the reasoning. Deterministic: same image bytes + same request, same result.
 */
export function resolveAutoOptions(
  source: PixelBuffer,
  provided: AutoPatternRequest,
): AutoResolution {
  const stats = analyzeImage(source);
  const decisions: AutoDecision[] = [];
  const decide = (field: string, value: string, reason: string) =>
    decisions.push({ field, value, reason });

  const repeat = provided.repeat ?? { across: 1, down: 1 };

  const seamless = provided.seamless ?? autoSeamless(repeat);
  if (provided.seamless === undefined && seamless !== 'none') {
    decide(
      'seamless',
      seamless,
      'The motif is repeated, so its edges are blended along the repeat direction(s) to hide the joins.',
    );
  }

  // A picture OF a pixel grid is converted one stitch per underlying cell — resampling it at
  // an unrelated stitch count would smear every output cell across cell boundaries. Two
  // detectors (see gridDetect.ts): the edge-lattice test for flat-color art (upscaled pixel
  // art, clean chart screenshots), and the grid-line chain detector for photos/scans of
  // charts. Flat art tries the lattice first — the chain detector can misread sparse
  // pixel-art boundaries as a coarser grid, while a genuinely gridded flat image passes the
  // lattice test with the same answer. Known limitation, deliberate: heavily aged/hand-
  // painted archival scans whose grids are too faint/warped for either detector fall back to
  // photo treatment rather than risking a confidently wrong cell count.
  const detectWanted =
    provided.widthStitches === undefined ||
    provided.heightRows === undefined ||
    provided.sampling === undefined ||
    provided.crop === undefined;
  let lattice: ReturnType<typeof detectPixelLattice> = null;
  let chartGrid: ChartGridDetection | null = null;
  if (detectWanted) {
    if (stats.isFlatArt) {
      lattice = detectPixelLattice(source);
      if (!lattice) chartGrid = detectChartGrid(source);
    } else {
      chartGrid = detectChartGrid(source);
    }
  }

  const sampling = provided.sampling ?? (chartGrid || stats.isFlatArt ? 'dominant' : 'average');
  if (provided.sampling === undefined) {
    decide(
      'sampling',
      sampling,
      chartGrid
        ? 'The image is a picture of an existing chart, so dominant-color sampling ignores its grid lines and recovers each cell’s flat color.'
        : stats.isFlatArt
          ? 'The image reads as flat-color art, so dominant-color sampling keeps its colors crisp.'
          : 'The image reads as a photo, so each stitch averages the pixels it covers.',
    );
  }

  // The user's gauge (if any) is passed through; proportions math falls back to the default.
  const gaugeForMath = provided.gauge ?? DEFAULT_GAUGE;

  const dims = autoDimensions(
    source,
    provided,
    stats,
    gaugeForMath,
    repeat,
    chartGrid,
    lattice,
    decide,
  );

  // For chart pictures, crop to the detected grid span so sampling cells align with chart
  // cells; for pixel-art-sized sources mapped 1:1, the whole image *is* the chart — don't
  // let the gauge-aspect suggested crop trim either.
  const crop =
    provided.crop ??
    (dims.fromChartGrid && chartGrid ? chartGrid.crop : dims.native ? fullRect(source) : undefined);

  const { technique, maxColors } = autoTechniqueAndColors(
    source,
    provided,
    stats,
    gaugeForMath,
    dims,
    crop,
    sampling,
    decide,
  );

  // Texture reduces the image to 2 tones; if the source has rich tonal shading (a photo or
  // gradient — many occupied tone buckets), dithering preserves that shading as relief.
  // Flat, few-tone sources (and all colorwork) chart best without it.
  const tonallyRich = stats.significantColors > 12 || !stats.isFlatArt;
  const dither =
    provided.dither ?? (technique === 'texture' && tonallyRich ? 'floyd-steinberg' : 'none');
  if (provided.dither === undefined) {
    decide(
      'dither',
      dither,
      dither === 'none'
        ? 'Dithering scatters single-stitch color changes that are impractical to knit, so colorwork charts are generated without it.'
        : 'For a two-tone texture chart of a photo, Floyd-Steinberg dithering preserves shading as knit/purl texture.',
    );
  }

  return {
    options: {
      technique,
      widthStitches: dims.widthStitches,
      heightRows: dims.heightRows,
      maxColors,
      dither,
      sampling,
      seamless,
      repeat,
      shadeMergeDeltaE: provided.shadeMergeDeltaE ?? WOOL_SHADE_DELTA_E,
      ...(provided.gauge ? { gauge: provided.gauge } : {}),
      ...(crop ? { crop } : {}),
    },
    decisions,
    stats,
  };
}

function fullRect(source: PixelBuffer): CropRect {
  return { x: 0, y: 0, width: source.width, height: source.height };
}

function autoSeamless(repeat: RepeatSpec): SeamlessMode {
  const across = repeat.across > 1;
  const down = repeat.down > 1;
  if (across && down) return 'both';
  if (across) return 'horizontal';
  if (down) return 'vertical';
  return 'none';
}

interface AutoDimensions {
  widthStitches: number;
  heightRows: number;
  /** True when the source was small flat art mapped 1 stitch per source pixel. */
  native: boolean;
  /** True when the dimensions came from a detected chart grid (1 stitch per chart cell). */
  fromChartGrid: boolean;
}

function autoDimensions(
  source: PixelBuffer,
  provided: AutoPatternRequest,
  stats: ImageStats,
  gauge: GaugeSpec,
  repeat: RepeatSpec,
  chartGrid: ChartGridDetection | null,
  lattice: ReturnType<typeof detectPixelLattice>,
  decide: (field: string, value: string, reason: string) => void,
): AutoDimensions {
  const maxWidth = Math.max(1, Math.floor(MAX_GRID_DIMENSION / repeat.across));
  const maxHeight = Math.max(1, Math.floor(MAX_GRID_DIMENSION / repeat.down));

  if (provided.widthStitches !== undefined && provided.heightRows !== undefined) {
    return {
      widthStitches: provided.widthStitches,
      heightRows: provided.heightRows,
      native: false,
      fromChartGrid: false,
    };
  }

  // Picture of an existing chart: one stitch per detected chart cell.
  if (
    provided.widthStitches === undefined &&
    provided.heightRows === undefined &&
    chartGrid &&
    chartGrid.cellsAcross <= maxWidth &&
    chartGrid.cellsDown <= maxHeight
  ) {
    decide(
      'size',
      `${chartGrid.cellsAcross} x ${chartGrid.cellsDown}`,
      'The image is a picture of an existing chart, so each of its cells becomes exactly one stitch.',
    );
    return {
      widthStitches: chartGrid.cellsAcross,
      heightRows: chartGrid.cellsDown,
      native: false,
      fromChartGrid: true,
    };
  }

  // Small flat-color art (existing pixel art / small chart): map 1 stitch per pixel so the
  // design comes through exactly, rather than resampling it.
  if (
    provided.widthStitches === undefined &&
    provided.heightRows === undefined &&
    stats.isFlatArt &&
    source.width <= AUTO_NATIVE_PIXEL_ART_MAX &&
    source.height <= AUTO_NATIVE_PIXEL_ART_MAX &&
    source.width <= maxWidth &&
    source.height <= maxHeight
  ) {
    decide(
      'size',
      `${source.width} x ${source.height}`,
      'The source is small flat-color art, so each source pixel becomes exactly one stitch.',
    );
    return {
      widthStitches: source.width,
      heightRows: source.height,
      native: true,
      fromChartGrid: false,
    };
  }

  // Larger flat-color art that is integer-UPSCALED pixel art (every color edge sits on a
  // common lattice): map one stitch per underlying art pixel, not per screen pixel.
  if (
    provided.widthStitches === undefined &&
    provided.heightRows === undefined &&
    lattice &&
    lattice.cellsAcross <= maxWidth &&
    lattice.cellsDown <= maxHeight &&
    (lattice.cellsAcross < source.width || lattice.cellsDown < source.height)
  ) {
    decide(
      'size',
      `${lattice.cellsAcross} x ${lattice.cellsDown}`,
      'The source is upscaled pixel art, so each underlying art pixel becomes exactly one stitch.',
    );
    return {
      widthStitches: lattice.cellsAcross,
      heightRows: lattice.cellsDown,
      native: true,
      fromChartGrid: false,
    };
  }

  // Aspect of the region that will be charted (the user's crop, or the whole image).
  const cropRegion = provided.crop ?? fullRect(source);
  const sourceAspect = cropRegion.width / Math.max(1, cropRegion.height);
  const cellAspect = stitchAspectRatio(gauge);

  const clampW = (n: number) => Math.min(maxWidth, Math.max(AUTO_MIN_DIMENSION, Math.round(n)));
  const clampH = (n: number) => Math.min(maxHeight, Math.max(AUTO_MIN_DIMENSION, Math.round(n)));

  if (provided.widthStitches !== undefined) {
    const heightRows = clampH((provided.widthStitches * cellAspect) / sourceAspect);
    decide(
      'size',
      `${provided.widthStitches} x ${heightRows}`,
      'Rows chosen so the knitted result keeps the image proportions at your stitch width.',
    );
    return {
      widthStitches: provided.widthStitches,
      heightRows,
      native: false,
      fromChartGrid: false,
    };
  }
  if (provided.heightRows !== undefined) {
    const widthStitches = clampW((provided.heightRows * sourceAspect) / cellAspect);
    decide(
      'size',
      `${widthStitches} x ${provided.heightRows}`,
      'Stitch width chosen so the knitted result keeps the image proportions at your row count.',
    );
    return { widthStitches, heightRows: provided.heightRows, native: false, fromChartGrid: false };
  }

  // Aim for a ~10in-wide finished panel at the working gauge (popular chart tools default to
  // 48-100 stitch widths), keeping the knitted aspect ratio equal to the image's.
  const widthStitches = clampW((gauge.stitchesPer4In * AUTO_TARGET_FINISHED_WIDTH_IN) / 4);
  const heightRows = clampH((widthStitches * cellAspect) / sourceAspect);
  decide(
    'size',
    `${widthStitches} x ${heightRows}`,
    `Sized for a roughly ${AUTO_TARGET_FINISHED_WIDTH_IN}in-wide finished panel at the working gauge, keeping the image's proportions once knitted.`,
  );
  return { widthStitches, heightRows, native: false, fromChartGrid: false };
}

/** Distinct palette colors per chart row, and color runs (yarn ends) per row. */
function rowComplexity(grid: Grid): { busyRowFraction: number; maxRunsPerRow: number } {
  let busyRows = 0;
  let maxRuns = 0;
  for (let y = 0; y < grid.height; y++) {
    const seen = new Set<number>();
    let runs = 0;
    let prev = -1;
    for (let x = 0; x < grid.width; x++) {
      const idx = grid.indices[y * grid.width + x] ?? 0;
      seen.add(idx);
      if (idx !== prev) {
        runs++;
        prev = idx;
      }
    }
    if (seen.size > 2) busyRows++;
    if (runs > maxRuns) maxRuns = runs;
  }
  return {
    busyRowFraction: grid.height > 0 ? busyRows / grid.height : 0,
    maxRunsPerRow: maxRuns,
  };
}

function autoTechniqueAndColors(
  source: PixelBuffer,
  provided: AutoPatternRequest,
  stats: ImageStats,
  gauge: GaugeSpec,
  dims: AutoDimensions,
  crop: CropRect | undefined,
  sampling: SamplingMode,
  decide: (field: string, value: string, reason: string) => void,
): { technique: Technique; maxColors: number } {
  const clampColors = (cap: number) => Math.max(2, Math.min(cap, stats.significantColors));

  if (provided.technique !== undefined) {
    const technique = provided.technique;
    const maxColors =
      provided.maxColors ??
      (technique === 'texture'
        ? 2
        : technique === 'stranded'
          ? clampColors(AUTO_STRANDED_MAX_PALETTE)
          : clampColors(AUTO_INTARSIA_MAX_PALETTE));
    if (provided.maxColors === undefined && technique !== 'texture') {
      decide(
        'maxColors',
        String(maxColors),
        technique === 'stranded'
          ? `Matched to the image's distinct colors, capped at ${AUTO_STRANDED_MAX_PALETTE} — traditional Fair Isle palettes stay small.`
          : `Matched to the image's distinct colors, capped at ${AUTO_INTARSIA_MAX_PALETTE} to keep the bobbin count manageable.`,
      );
    }
    return { technique, maxColors };
  }

  if (stats.isNearMonochrome) {
    decide(
      'technique',
      'texture',
      'The image is effectively grayscale, so it maps naturally to single-color knit/purl relief.',
    );
    return { technique: 'texture', maxColors: provided.maxColors ?? 2 };
  }

  // Evaluate a candidate quantized grid with the same pure functions the real pattern uses,
  // then pick the technique whose standard practice the grid actually fits.
  const evalColors = provided.maxColors ?? clampColors(8);
  const evalCrop =
    crop ??
    suggestedCropRect(source.width, source.height, dims.widthStitches, dims.heightRows, gauge);
  const samples = sampleImage(source, evalCrop, dims.widthStitches, dims.heightRows, sampling);
  const evalGrid = quantizeGrid(samples, dims.widthStitches, dims.heightRows, {
    maxColors: evalColors,
    dither: 'none',
    shadeMergeDeltaE: provided.shadeMergeDeltaE ?? WOOL_SHADE_DELTA_E,
  });
  const { busyRowFraction, maxRunsPerRow } = rowComplexity(evalGrid);

  if (busyRowFraction <= AUTO_STRANDED_MAX_BUSY_ROW_FRACTION) {
    const maxColors = provided.maxColors ?? Math.min(evalColors, AUTO_STRANDED_MAX_PALETTE);
    decide(
      'technique',
      'stranded',
      'Almost every row uses at most 2 colors, which is exactly what stranded (Fair Isle) knitting is built for.',
    );
    if (provided.maxColors === undefined) {
      decide(
        'maxColors',
        String(maxColors),
        `Capped at ${AUTO_STRANDED_MAX_PALETTE} total colors, in line with traditional Fair Isle palettes.`,
      );
    }
    return { technique: 'stranded', maxColors };
  }

  if (maxRunsPerRow <= AUTO_INTARSIA_MAX_YARN_ENDS_PER_ROW) {
    const maxColors = provided.maxColors ?? clampColors(AUTO_INTARSIA_MAX_PALETTE);
    decide(
      'technique',
      'intarsia',
      `Rows use more than 2 colors but at most ${AUTO_INTARSIA_MAX_YARN_ENDS_PER_ROW} color blocks each, so intarsia (one bobbin per block, no floats) stays practical.`,
    );
    if (provided.maxColors === undefined) {
      decide(
        'maxColors',
        String(maxColors),
        `Capped at ${AUTO_INTARSIA_MAX_PALETTE} palette colors to keep bobbin management practical.`,
      );
    }
    return { technique: 'intarsia', maxColors };
  }

  // Busy, photo-like content: neither fits cleanly. Stranded with a small palette degrades
  // best — floats handle scattered color better than hundreds of intarsia bobbins would, and
  // the generator flags any rows that still exceed 2 colors.
  const maxColors = provided.maxColors ?? AUTO_STRANDED_MAX_PALETTE;
  decide(
    'technique',
    'stranded',
    'The image is too busy for clean intarsia blocks, so stranded with a small palette is the practical choice; rows needing more than 2 colors are flagged in the instructions.',
  );
  if (provided.maxColors === undefined) {
    decide(
      'maxColors',
      String(maxColors),
      'A small palette keeps busy, photo-like content knittable as stranded colorwork.',
    );
  }
  return { technique: 'stranded', maxColors };
}

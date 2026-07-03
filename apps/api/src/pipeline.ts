import sharp from 'sharp';
import {
  buildPatternResult,
  buildYardageEstimate,
  encodePatternSpec,
  finishedSize,
  makeSeamless,
  resolveAutoOptions,
  sampleImage,
  seamlessModeToOptions,
  quantizeGrid,
  quantizeTexture,
  serializeGrid,
  suggestedCropRect,
  tileGrid,
  type AutoDecision,
  type CropRect,
  type Grid,
  type GridJson,
  type PatternResultJson,
  type PixelBuffer,
  type ResolvedPatternOptions,
} from 'knitting-pattern-core';
import type { PatternOptions } from './schemas.js';

export class InvalidImageError extends Error {}

/**
 * Decodes an arbitrary uploaded image (JPEG/PNG/WebP/GIF/TIFF/AVIF/BMP, whatever libvips
 * supports) to a raw RGBA buffer. EXIF orientation is applied so phone photos aren't sideways.
 * This is the ONLY place sharp is used — everything downstream is pure, dependency-free
 * `packages/core` math, so the deterministic guarantees don't depend on sharp/libvips's own
 * (non-guaranteed-stable) resizing behavior.
 */
export async function decodeImage(buffer: Buffer): Promise<PixelBuffer> {
  try {
    const { data, info } = await sharp(buffer)
      .rotate()
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    return {
      width: info.width,
      height: info.height,
      data: Uint8ClampedArray.from(data),
    };
  } catch (err) {
    throw new InvalidImageError(
      `Could not decode image: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export interface PipelineResult {
  grid: GridJson;
  crop: CropRect;
  sourceImage: { width: number; height: number };
  finishedSize?: { widthIn: number; heightIn: number };
  pattern: PatternResultJson;
  yardage: ReturnType<typeof buildYardageEstimate>;
  shareLink: string;
  seamless: ResolvedPatternOptions['seamless'];
  repeat: ResolvedPatternOptions['repeat'];
  /** Size of one motif tile before repetition. */
  motif: { widthStitches: number; heightRows: number };
  /** The concrete options this pattern was generated with (user's + auto-chosen). */
  resolvedOptions: ResolvedPatternOptions;
  /** Choices auto mode made for fields the request left unset, with reasons. */
  autoDecisions: AutoDecision[];
}

/**
 * The full deterministic pipeline: decode -> resolve unset options from the image (auto
 * mode) -> crop -> sample -> seamless-blend the motif -> quantize -> tile (repeat) ->
 * generate pattern -> estimate yardage -> encode a shareable link. Given the same image
 * bytes and options, this always returns byte-identical results.
 *
 * `widthStitches`/`heightRows` size ONE motif tile; `repeat` then tiles it into the final
 * chart. Seamless blending runs on the motif before quantization (so tile edges match), and
 * tiling runs on the quantized index grid (so every copy is byte-identical).
 */
export async function runPipeline(
  imageBuffer: Buffer,
  requested: PatternOptions,
): Promise<PipelineResult> {
  const source = await decodeImage(imageBuffer);

  const { options, decisions } = resolveAutoOptions(source, requested);

  const crop: CropRect =
    options.crop ??
    suggestedCropRect(
      source.width,
      source.height,
      options.widthStitches,
      options.heightRows,
      options.gauge,
    );

  const pixelated = sampleImage(
    source,
    crop,
    options.widthStitches,
    options.heightRows,
    options.sampling,
  );
  const seamlessAxes = seamlessModeToOptions(options.seamless);
  const samples =
    seamlessAxes.horizontal || seamlessAxes.vertical
      ? makeSeamless(pixelated, options.widthStitches, options.heightRows, seamlessAxes)
      : pixelated;

  const motifGrid: Grid =
    options.technique === 'texture'
      ? quantizeTexture(samples, options.widthStitches, options.heightRows, options.dither)
      : quantizeGrid(samples, options.widthStitches, options.heightRows, {
          maxColors: options.maxColors,
          dither: options.dither,
        });

  // Materialize the repeat: tile the quantized motif into the final chart.
  const grid = tileGrid(motifGrid, options.repeat.across, options.repeat.down);

  const pattern = buildPatternResult(options.technique, grid);
  const yardage = buildYardageEstimate(grid, options.gauge, pattern);
  const shareLink = encodePatternSpec({
    technique: options.technique,
    grid,
    ...(options.gauge ? { gauge: options.gauge } : {}),
  });

  return {
    grid: serializeGrid(grid),
    crop,
    sourceImage: { width: source.width, height: source.height },
    pattern,
    yardage,
    shareLink,
    seamless: options.seamless,
    repeat: options.repeat,
    motif: { widthStitches: options.widthStitches, heightRows: options.heightRows },
    resolvedOptions: options,
    autoDecisions: decisions,
    ...(options.gauge
      ? {
          finishedSize: finishedSize(
            { widthStitches: grid.width, heightRows: grid.height },
            options.gauge,
          ),
        }
      : {}),
  };
}

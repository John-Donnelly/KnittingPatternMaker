import sharp from 'sharp';
import {
  encodePatternSpec,
  finishedSize,
  pixelate,
  quantizeGrid,
  quantizeTexture,
  suggestedCropRect,
  type CropRect,
  type Grid,
  type PixelBuffer,
} from 'knitting-pattern-core';
import type { PatternOptions } from './schemas.js';
import {
  buildPatternResult,
  buildYardageEstimate,
  type PatternResultJson,
} from './patternBuilder.js';
import { serializeGrid, type GridJson } from './serialize.js';

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
}

/**
 * The full deterministic pipeline: crop -> pixelate -> quantize -> generate pattern ->
 * estimate yardage -> encode a shareable link. Given the same image bytes and options, this
 * always returns byte-identical results.
 */
export async function runPipeline(
  imageBuffer: Buffer,
  options: PatternOptions,
): Promise<PipelineResult> {
  const source = await decodeImage(imageBuffer);

  const crop: CropRect =
    options.crop ??
    suggestedCropRect(
      source.width,
      source.height,
      options.widthStitches,
      options.heightRows,
      options.gauge,
    );

  const samples = pixelate(source, crop, options.widthStitches, options.heightRows);

  const grid: Grid =
    options.technique === 'texture'
      ? quantizeTexture(samples, options.widthStitches, options.heightRows, options.dither)
      : quantizeGrid(samples, options.widthStitches, options.heightRows, {
          maxColors: options.maxColors,
          dither: options.dither,
        });

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
    ...(options.gauge
      ? {
          finishedSize: finishedSize(
            { widthStitches: options.widthStitches, heightRows: options.heightRows },
            options.gauge,
          ),
        }
      : {}),
  };
}

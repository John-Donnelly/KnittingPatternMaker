// Port of apps/api/src/pipeline.ts with the sharp decode swapped for the WASM decoder —
// everything after decode is the same pure knitting-pattern-core math, so results are
// byte-identical to the Node server for the same image bytes and options.
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
  type ResolvedPatternOptions,
} from 'knitting-pattern-core';
import { decodeImage } from './decode.js';
import type { PatternOptions } from './schemas.js';

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
  motif: { widthStitches: number; heightRows: number };
  resolvedOptions: ResolvedPatternOptions;
  autoDecisions: AutoDecision[];
}

export async function runPipeline(
  imageBuffer: ArrayBuffer,
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
          shadeMergeDeltaE: options.shadeMergeDeltaE,
        });

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

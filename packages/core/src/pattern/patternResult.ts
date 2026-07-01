import type { GaugeSpec, Grid, Technique } from '../types.js';
import { estimateYardage, type YardageEstimate } from './yarnEstimate.js';
import {
  generateStrandedPattern,
  type ColorworkRowInstruction,
  type FloatWarning,
  type ManyColorRowWarning,
} from './strandedColorwork.js';
import { generateIntarsiaPattern, type IntarsiaBlock } from './intarsia.js';
import { generateTexturePattern, type TextureRowInstruction } from './textureKnitPurl.js';
import { serializeNumberMap } from './gridJson.js';

export interface StrandedPatternJson {
  technique: 'stranded';
  rows: ColorworkRowInstruction[];
  floatWarnings: FloatWarning[];
  manyColorRowWarnings: ManyColorRowWarning[];
  totalFloatStitchesByColor: [number, number][];
}

export interface IntarsiaPatternJson {
  technique: 'intarsia';
  rows: ColorworkRowInstruction[];
  blocks: IntarsiaBlock[];
  bobbinCount: number;
}

export interface TexturePatternJson {
  technique: 'texture';
  rows: TextureRowInstruction[];
}

export type PatternResultJson = StrandedPatternJson | IntarsiaPatternJson | TexturePatternJson;

/** Total stitches each color is carried behind the work; only stranded colorwork has floats. */
function floatStitchesByColor(patternResult: PatternResultJson): Map<number, number> | undefined {
  return patternResult.technique === 'stranded'
    ? new Map(patternResult.totalFloatStitchesByColor)
    : undefined;
}

/**
 * Regenerates the technique-specific, JSON-safe instructions for a grid. Pure and
 * deterministic: the same (technique, grid) pair always reproduces the identical result, so
 * both the frontend (typing the `/api/pattern` response) and the backend (reconstructing a
 * pattern from just a grid for export, no original image or cache needed) share one definition.
 */
export function buildPatternResult(technique: Technique, grid: Grid): PatternResultJson {
  switch (technique) {
    case 'stranded': {
      const result = generateStrandedPattern(grid);
      return {
        technique: 'stranded',
        rows: result.rows,
        floatWarnings: result.floatWarnings,
        manyColorRowWarnings: result.manyColorRowWarnings,
        totalFloatStitchesByColor: serializeNumberMap(result.totalFloatStitchesByColor),
      };
    }
    case 'intarsia': {
      const result = generateIntarsiaPattern(grid);
      return {
        technique: 'intarsia',
        rows: result.rows,
        blocks: result.blocks,
        bobbinCount: result.bobbinCount,
      };
    }
    case 'texture': {
      const result = generateTexturePattern(grid);
      return { technique: 'texture', rows: result.rows };
    }
  }
}

export function buildYardageEstimate(
  grid: Grid,
  gauge: GaugeSpec | undefined,
  patternResult: PatternResultJson,
): YardageEstimate {
  return estimateYardage(grid, gauge, floatStitchesByColor(patternResult));
}

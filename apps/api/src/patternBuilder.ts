import {
  estimateYardage,
  generateIntarsiaPattern,
  generateStrandedPattern,
  generateTexturePattern,
  type ColorworkRowInstruction,
  type FloatWarning,
  type GaugeSpec,
  type Grid,
  type IntarsiaBlock,
  type ManyColorRowWarning,
  type Technique,
  type TextureRowInstruction,
  type YardageEstimate,
} from 'knitting-pattern-core';
import { serializeNumberMap } from './serialize.js';

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
 * Regenerates the technique-specific instructions for a grid. Pure and deterministic: the
 * same (technique, grid) pair always reproduces the identical result, so export endpoints can
 * reconstruct a pattern from just the grid without needing the original image or a cache.
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

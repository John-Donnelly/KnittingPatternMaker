import { unzlibSync, zlibSync } from 'fflate';
import type { GaugeSpec, Grid, RGB, Technique } from '../types.js';
import { decodeBase64Url, encodeBase64Url } from './base64url.js';

export interface PatternSpec {
  technique: Technique;
  gauge?: GaugeSpec;
  grid: Grid;
}

const KNOWN_TECHNIQUES: readonly Technique[] = ['stranded', 'intarsia', 'texture'];

interface SerializedSpecV1 {
  v: 1;
  t: Technique;
  g?: { s: number; r: number };
  w: number;
  h: number;
  p: [number, number, number][];
  i: number[];
}

/**
 * Encodes a fully-computed pattern (technique + gauge + the final quantized grid) into a
 * compact, URL-safe, self-contained string: deflate-compressed JSON, base64url-encoded. The
 * grid itself is embedded (not just the settings), so a shared link reproduces the exact
 * pattern without needing the original source image.
 */
export function encodePatternSpec(spec: PatternSpec): string {
  const serialized: SerializedSpecV1 = {
    v: 1,
    t: spec.technique,
    w: spec.grid.width,
    h: spec.grid.height,
    p: spec.grid.palette.map((c): [number, number, number] => [c.r, c.g, c.b]),
    i: Array.from(spec.grid.indices),
    ...(spec.gauge ? { g: { s: spec.gauge.stitchesPer4In, r: spec.gauge.rowsPer4In } } : {}),
  };
  const json = JSON.stringify(serialized);
  const compressed = zlibSync(new TextEncoder().encode(json), { level: 9 });
  return encodeBase64Url(compressed);
}

/** Inverse of {@link encodePatternSpec}. Throws a descriptive error on any corrupt/tampered input. */
export function decodePatternSpec(encoded: string): PatternSpec {
  let bytes: Uint8Array;
  try {
    bytes = decodeBase64Url(encoded);
  } catch (err) {
    throw new Error(`Invalid pattern link: ${(err as Error).message}`, { cause: err });
  }

  let json: string;
  try {
    json = new TextDecoder().decode(unzlibSync(bytes));
  } catch {
    throw new Error('Invalid or corrupted pattern link');
  }

  let parsed: SerializedSpecV1;
  try {
    parsed = JSON.parse(json) as SerializedSpecV1;
  } catch {
    throw new Error('Invalid pattern link payload');
  }

  if (parsed.v !== 1) {
    throw new Error(`Unsupported pattern link version: ${String(parsed.v)}`);
  }
  if (!KNOWN_TECHNIQUES.includes(parsed.t)) {
    throw new Error(`Unknown technique in pattern link: ${String(parsed.t)}`);
  }
  if (!Number.isInteger(parsed.w) || !Number.isInteger(parsed.h) || parsed.w < 1 || parsed.h < 1) {
    throw new Error('Invalid grid dimensions in pattern link');
  }
  if (!Array.isArray(parsed.i) || parsed.i.length !== parsed.w * parsed.h) {
    throw new Error('Corrupted pattern link: index/grid size mismatch');
  }
  if (!Array.isArray(parsed.p) || parsed.p.length === 0) {
    throw new Error('Corrupted pattern link: missing palette');
  }
  if (parsed.i.some((idx) => !Number.isInteger(idx) || idx < 0 || idx >= parsed.p.length)) {
    throw new Error('Corrupted pattern link: index out of palette range');
  }

  const palette: RGB[] = parsed.p.map(([r, g, b]) => ({ r, g, b }));
  const grid: Grid = {
    width: parsed.w,
    height: parsed.h,
    indices: Uint16Array.from(parsed.i),
    palette,
  };
  return {
    technique: parsed.t,
    grid,
    ...(parsed.g ? { gauge: { stitchesPer4In: parsed.g.s, rowsPer4In: parsed.g.r } } : {}),
  };
}

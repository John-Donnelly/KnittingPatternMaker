import { unzlibSync, zlibSync } from 'fflate';
import type { GaugeSpec, Grid, RGB, Technique } from '../types.js';
import { decodeBase64Url, encodeBase64Url } from './base64url.js';
import { MAX_COLORS, MAX_GRID_DIMENSION, MAX_SHARE_LINK_LENGTH } from '../limits.js';

/** Matches the HTTP API's GaugeSpecSchema bounds (apps/api/src/schemas.ts). */
const MAX_GAUGE_VALUE = 200;

function isValidGaugeValue(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MAX_GAUGE_VALUE
  );
}

function isValidColorChannel(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 255;
}

export interface PatternSpec {
  technique: Technique;
  gauge?: GaugeSpec;
  grid: Grid;
}

const KNOWN_TECHNIQUES: readonly Technique[] = ['stranded', 'intarsia', 'texture'];

/**
 * Hard cap on decompressed bytes, enforced by decompressing into a fixed-size buffer. A
 * worst-case (noisy) MAX_GRID_DIMENSION x MAX_GRID_DIMENSION, MAX_COLORS pattern's JSON is
 * ~1.3MB uncompressed, so 4MB gives generous headroom for legitimate patterns while still
 * bounding a maliciously crafted link (deflate can expand highly repetitive input by orders of
 * magnitude) to a small, fixed amount of memory instead of however large the attacker wants.
 */
const MAX_DECOMPRESSED_BYTES = 4 * 1024 * 1024;

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

/**
 * Inverse of {@link encodePatternSpec}. Throws a descriptive error on any corrupt/tampered
 * input. `encoded` is untrusted (anyone can craft a link), so this rejects oversized input
 * before decompressing it and re-validates grid dimensions after — see MAX_SHARE_LINK_LENGTH.
 */
export function decodePatternSpec(encoded: string): PatternSpec {
  if (encoded.length > MAX_SHARE_LINK_LENGTH) {
    throw new Error(`Pattern link is too long (max ${MAX_SHARE_LINK_LENGTH} characters)`);
  }

  let bytes: Uint8Array;
  try {
    bytes = decodeBase64Url(encoded);
  } catch (err) {
    throw new Error(`Invalid pattern link: ${(err as Error).message}`, { cause: err });
  }

  let json: string;
  try {
    const out = new Uint8Array(MAX_DECOMPRESSED_BYTES);
    json = new TextDecoder().decode(unzlibSync(bytes, { out }));
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
  if (
    !Number.isInteger(parsed.w) ||
    !Number.isInteger(parsed.h) ||
    parsed.w < 1 ||
    parsed.h < 1 ||
    parsed.w > MAX_GRID_DIMENSION ||
    parsed.h > MAX_GRID_DIMENSION
  ) {
    throw new Error('Invalid grid dimensions in pattern link');
  }
  if (!Array.isArray(parsed.i) || parsed.i.length !== parsed.w * parsed.h) {
    throw new Error('Corrupted pattern link: index/grid size mismatch');
  }
  if (!Array.isArray(parsed.p) || parsed.p.length === 0 || parsed.p.length > MAX_COLORS) {
    throw new Error('Corrupted pattern link: invalid palette size');
  }
  if (
    parsed.p.some(
      (rgb) => !Array.isArray(rgb) || rgb.length !== 3 || !rgb.every(isValidColorChannel),
    )
  ) {
    throw new Error('Corrupted pattern link: invalid palette color');
  }
  if (parsed.i.some((idx) => !Number.isInteger(idx) || idx < 0 || idx >= parsed.p.length)) {
    throw new Error('Corrupted pattern link: index out of palette range');
  }
  if (
    parsed.g !== undefined &&
    (typeof parsed.g !== 'object' ||
      parsed.g === null ||
      !isValidGaugeValue(parsed.g.s) ||
      !isValidGaugeValue(parsed.g.r))
  ) {
    throw new Error('Corrupted pattern link: invalid gauge');
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

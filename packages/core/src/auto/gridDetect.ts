import type { CropRect, PixelBuffer } from '../types.js';
import { MAX_GRID_DIMENSION } from '../limits.js';

/**
 * Detectors for images that are pictures OF pixel grids, where the right conversion is
 * "one stitch per underlying cell" rather than resampling at an unrelated stitch count:
 *
 * - {@link detectChartGrid}: a photographed/scanned/screenshotted chart WITH visible grid
 *   lines (knitting, cross-stitch, point paper). Signature: strong edge peaks at (almost)
 *   EVERY multiple of some pitch, possibly only across part of the image (scans have
 *   margins). Found by chaining actual edge peaks with consistent spacing — deriving the
 *   pitch from chain endpoints, so it cannot drift across large scans the way a fixed-step
 *   pitch scan does.
 *
 * - {@link detectPixelLattice}: integer-UPSCALED pixel art (no grid lines). Signature: edges
 *   only where colors change, but every edge sits ON a multiple of the art-pixel size. Found
 *   by checking that all edge peaks align to a common lattice.
 *
 * Both are pure signal processing, fully deterministic.
 */

export interface ChartGridDetection {
  cellsAcross: number;
  cellsDown: number;
  /** Crop aligned to the detected grid span, so sampling cells match chart cells 1:1. */
  crop: CropRect;
}

export interface PixelLatticeDetection {
  cellsAcross: number;
  cellsDown: number;
}

/** An edge peak must beat the axis's mean edge energy by this factor to count as a line. */
const PEAK_FACTOR = 2;
/** Grid pitch bounds in source pixels: below ~4px lines are not resolvable. */
const MIN_PITCH = 4;
/** Need at least this many grid lines chained per axis to call it a chart. */
const MIN_LINES = 8;
/** Fraction of chain positions that must actually hold a line (tolerates a few faint ones). */
const MIN_CHAIN_DENSITY = 0.75;
/** Cap on detected chart cells per axis — tracks the output grid limit so a large source chart
 * can be reproduced at its native cell resolution. */
const MAX_CELLS = MAX_GRID_DIMENSION;

interface AxisChain {
  /** Refined pitch: physical chain span / step count (immune to per-step rounding drift). */
  pitch: number;
  /** First and last line positions of the chain. */
  start: number;
  end: number;
  lines: number;
}

// --- shared profile / peak helpers ------------------------------------------------------

function luminance(source: PixelBuffer): Float64Array {
  const out = new Float64Array(source.width * source.height);
  const { data } = source;
  for (let i = 0; i < out.length; i++) {
    const o = i * 4;
    out[i] = 0.299 * (data[o] ?? 0) + 0.587 * (data[o + 1] ?? 0) + 0.114 * (data[o + 2] ?? 0);
  }
  return out;
}

function edgeProfiles(source: PixelBuffer): { col: Float64Array; row: Float64Array } {
  const lum = luminance(source);
  const col = new Float64Array(source.width - 1);
  const row = new Float64Array(source.height - 1);
  for (let y = 0; y < source.height; y++) {
    const base = y * source.width;
    for (let x = 0; x < source.width - 1; x++) {
      col[x] = (col[x] ?? 0) + Math.abs((lum[base + x + 1] ?? 0) - (lum[base + x] ?? 0));
      if (y < source.height - 1) {
        row[y] =
          (row[y] ?? 0) + Math.abs((lum[base + source.width + x] ?? 0) - (lum[base + x] ?? 0));
      }
    }
  }
  return { col, row };
}

function meanOf(profile: Float64Array): number {
  let sum = 0;
  for (const v of profile) sum += v;
  return profile.length > 0 ? sum / profile.length : 0;
}

/**
 * Local maxima above PEAK_FACTOR x mean, with non-maximum suppression over a +-2px radius —
 * a physical grid line 1-2px wide produces edge energy on both flanks; suppression keeps one
 * peak per line.
 */
function findPeaks(profile: Float64Array, mean: number): number[] {
  const threshold = mean * PEAK_FACTOR;
  const raw: number[] = [];
  for (let x = 0; x < profile.length; x++) {
    const v = profile[x] ?? 0;
    if (v <= threshold) continue;
    const prev = profile[x - 1] ?? -1;
    const next = profile[x + 1] ?? -1;
    if (v >= prev && v > next) raw.push(x);
  }
  const peaks: number[] = [];
  for (const x of raw) {
    const last = peaks[peaks.length - 1];
    if (last !== undefined && x - last <= 2) {
      // Same physical line: keep the stronger flank.
      if ((profile[x] ?? 0) > (profile[last] ?? 0)) peaks[peaks.length - 1] = x;
    } else {
      peaks.push(x);
    }
  }
  return peaks;
}

/** Edge energy at a candidate line position: the strongest edge within +-1px (a grid line
 * produces edges on both flanks, and JPEG shifts them a little). */
function positionEnergy(profile: Float64Array, x: number): number {
  let best = 0;
  for (let dx = -1; dx <= 1; dx++) {
    const v = profile[x + dx];
    if (v !== undefined && v > best) best = v;
  }
  return best;
}

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? 0)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

// --- chart mode (grid lines at every pitch multiple) -------------------------------------

function chartAxisChain(peaks: number[]): AxisChain | null {
  if (peaks.length < MIN_LINES) return null;

  const diffs: number[] = [];
  for (let i = 1; i < peaks.length; i++) diffs.push((peaks[i] ?? 0) - (peaks[i - 1] ?? 0));
  const pitch0 = median(diffs);
  if (pitch0 < MIN_PITCH) return null;

  // Walk the peaks, chaining consecutive ones whose spacing is ~1x the pitch (or ~2x —
  // a single missing/faint line). Track the best chain by physical span, then line count.
  let best: { start: number; end: number; lines: number; steps: number } | null = null;
  let start = peaks[0] ?? 0;
  let prev = start;
  let lines = 1;
  let steps = 0;

  const commit = () => {
    if (
      lines >= MIN_LINES &&
      (!best ||
        prev - start > best.end - best.start ||
        (prev - start === best.end - best.start && lines > best.lines))
    ) {
      best = { start, end: prev, lines, steps };
    }
  };

  for (let i = 1; i < peaks.length; i++) {
    const peak = peaks[i] ?? 0;
    const gap = peak - prev;
    const ratio = gap / pitch0;
    if (ratio >= 0.75 && ratio <= 1.35) {
      steps += 1;
      lines += 1;
      prev = peak;
    } else if (ratio >= 1.75 && ratio <= 2.25) {
      steps += 2; // one faint/missing line inside the chain
      lines += 1;
      prev = peak;
    } else {
      commit();
      start = peak;
      prev = peak;
      lines = 1;
      steps = 0;
    }
  }
  commit();

  if (!best) return null;
  const chain = best as { start: number; end: number; lines: number; steps: number };
  if (chain.lines / (chain.steps + 1) < MIN_CHAIN_DENSITY) return null;

  return {
    pitch: (chain.end - chain.start) / chain.steps,
    start: chain.start,
    end: chain.end,
    lines: chain.steps + 1,
  };
}

/**
 * Extends an established chain outward one pitch at a time using a RELAXED per-line test.
 * The strong chain proves the grid exists and pins the pitch; beyond its ends, grid lines
 * over dark/low-contrast content are too faint for the global peak threshold (the exact
 * failure seen on a real chart whose bottom rows are solid dark: the design's last rows
 * were cropped off mid-motif). With the pitch known, it is enough that the candidate
 * position is locally distinct — clearly stronger than its half-pitch neighborhood — and
 * above an absolute floor so a blank margin (uniform paper, near-zero edge energy
 * everywhere) never extends.
 */
function extendChain(profile: Float64Array, chain: AxisChain): AxisChain {
  // Average energy of an in-chain line position: the reference for the absolute floor.
  let refSum = 0;
  let refCount = 0;
  for (let pos = chain.start; pos <= chain.end + 0.1; pos += chain.pitch) {
    refSum += positionEnergy(profile, Math.round(pos));
    refCount++;
  }
  const floor = (refCount > 0 ? refSum / refCount : 0) * 0.1;

  const locallyDistinctLine = (posFloat: number): boolean => {
    const pos = Math.round(posFloat);
    if (pos < 1 || pos >= profile.length - 1) return false;
    const energy = positionEnergy(profile, pos);
    if (energy <= floor) return false;
    const half = Math.max(2, Math.floor(chain.pitch / 2));
    let neighborhoodSum = 0;
    let neighborhoodCount = 0;
    for (let x = pos - half; x <= pos + half; x++) {
      if (x < 0 || x >= profile.length || Math.abs(x - pos) <= 1) continue;
      neighborhoodSum += profile[x] ?? 0;
      neighborhoodCount++;
    }
    const neighborhoodMean = neighborhoodCount > 0 ? neighborhoodSum / neighborhoodCount : 0;
    return energy > neighborhoodMean * 1.5;
  };

  let { start, end, lines } = chain;
  for (let next = end + chain.pitch; next < profile.length; next += chain.pitch) {
    if (!locallyDistinctLine(next)) break;
    end = next;
    lines++;
  }
  for (let next = start - chain.pitch; next >= 0; next -= chain.pitch) {
    if (!locallyDistinctLine(next)) break;
    start = next;
    lines++;
  }

  return { pitch: chain.pitch, start: Math.round(start), end: Math.round(end), lines };
}

export function detectChartGrid(source: PixelBuffer): ChartGridDetection | null {
  if (source.width < MIN_PITCH * MIN_LINES || source.height < MIN_PITCH * MIN_LINES) return null;

  const { col, row } = edgeProfiles(source);
  const xChainRaw = chartAxisChain(findPeaks(col, meanOf(col)));
  const yChainRaw = chartAxisChain(findPeaks(row, meanOf(row)));
  if (!xChainRaw || !yChainRaw) return null;
  const xChain = extendChain(col, xChainRaw);
  const yChain = extendChain(row, yChainRaw);

  // A real chart has near-square-ish cells in source pixels; wildly different pitches mean
  // the two axes latched onto unrelated structures.
  const pitchRatio = xChain.pitch / yChain.pitch;
  if (pitchRatio < 0.5 || pitchRatio > 2) return null;

  const cellsAcross = xChain.lines - 1;
  const cellsDown = yChain.lines - 1;
  if (
    cellsAcross < MIN_LINES - 1 ||
    cellsDown < MIN_LINES - 1 ||
    cellsAcross > MAX_CELLS ||
    cellsDown > MAX_CELLS
  ) {
    return null;
  }

  // The peak at x sits on the edge between pixel x and x+1; the grid content spans from the
  // first line to the last.
  const x0 = Math.max(0, xChain.start + 1);
  const y0 = Math.max(0, yChain.start + 1);
  const width = Math.min(source.width - x0, xChain.end - xChain.start);
  const height = Math.min(source.height - y0, yChain.end - yChain.start);
  if (width < 1 || height < 1) return null;

  return { cellsAcross, cellsDown, crop: { x: x0, y: y0, width, height } };
}

// --- lattice mode (integer-upscaled pixel art, no grid lines) ----------------------------

/** Edges must sit within this many pixels of a lattice position. */
const LATTICE_TOLERANCE = 1.5;
const LATTICE_MIN_EDGES = 4;
const LATTICE_MIN_CELLS = 8;

function latticeAxisPitch(peaks: number[], len: number): number | null {
  if (peaks.length < LATTICE_MIN_EDGES) return null;

  // Edge peak at x = boundary between pixel x and x+1 = lattice coordinate x+1.
  const edges = peaks.map((x) => x + 1);

  // Candidate pitches: divisors of the smallest edge spacing (every spacing is a multiple of
  // the art-pixel size, so the smallest one is 1x..kx the pitch).
  let minGap = Infinity;
  for (let i = 1; i < edges.length; i++) {
    const gap = (edges[i] ?? 0) - (edges[i - 1] ?? 0);
    if (gap > 0 && gap < minGap) minGap = gap;
  }
  if (!Number.isFinite(minGap)) return null;

  for (let k = 1; k <= 8; k++) {
    const pitch = minGap / k;
    if (pitch < MIN_PITCH) break;
    const cells = Math.round(len / pitch);
    if (cells < LATTICE_MIN_CELLS || cells > MAX_CELLS) continue;
    // The image extent itself must be a whole number of art pixels...
    if (Math.abs(len - cells * pitch) > LATTICE_TOLERANCE) continue;
    // ...and EVERY edge must sit on the lattice (phase 0 — upscaled art starts at 0).
    const aligned = edges.every((e) => {
      const nearest = Math.round(e / pitch) * pitch;
      return Math.abs(e - nearest) <= LATTICE_TOLERANCE;
    });
    if (aligned) return pitch;
  }
  return null;
}

/**
 * Detects integer-upscaled pixel art: every color edge lies on a multiple of the art-pixel
 * size. Returns the underlying art dimensions, or null. Only meaningful for flat-color
 * images (the caller gates on that) — photos have edges everywhere and never align.
 */
export function detectPixelLattice(source: PixelBuffer): PixelLatticeDetection | null {
  const { col, row } = edgeProfiles(source);
  const px = latticeAxisPitch(findPeaks(col, meanOf(col)), source.width);
  const py = latticeAxisPitch(findPeaks(row, meanOf(row)), source.height);
  if (px === null || py === null) return null;

  return {
    cellsAcross: Math.round(source.width / px),
    cellsDown: Math.round(source.height / py),
  };
}

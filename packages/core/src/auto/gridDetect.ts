import type { CropRect, PixelBuffer } from '../types.js';

/**
 * Detects whether the source image is a picture of an EXISTING chart — pixel art or a
 * knitting/cross-stitch chart photographed, scanned, or screenshotted WITH its grid lines.
 * Such an image has strong, periodic vertical and horizontal edges (the grid), and the right
 * way to convert it is one stitch per chart cell with dominant sampling — not resampling it
 * at an unrelated stitch count, which smears every output cell across chart-cell boundaries.
 *
 * Detection is pure signal processing, fully deterministic: sum edge strength per column/row,
 * then search (pitch, phase) pairs for the spacing whose positions concentrate the most edge
 * energy relative to the image's average edge level.
 */
export interface ChartGridDetection {
  cellsAcross: number;
  cellsDown: number;
  /** Crop aligned to the detected grid span, so sampling cells match chart cells 1:1. */
  crop: CropRect;
}

/** A grid line's edge energy must beat the image's mean edge energy by this factor. */
const MIN_SCORE = 2.2;
/** Grid pitch bounds in source pixels: below ~4px lines are not resolvable. */
const MIN_PITCH = 4;
/** Need at least this many grid lines per axis to call it a chart. */
const MIN_LINES = 8;
const MAX_CELLS = 400;

interface AxisFit {
  pitch: number;
  phase: number;
  score: number;
  lines: number;
}

export function detectChartGrid(source: PixelBuffer): ChartGridDetection | null {
  if (source.width < MIN_PITCH * MIN_LINES || source.height < MIN_PITCH * MIN_LINES) return null;

  const lum = luminance(source);
  const colEdges = new Float64Array(source.width - 1);
  const rowEdges = new Float64Array(source.height - 1);
  for (let y = 0; y < source.height; y++) {
    const row = y * source.width;
    for (let x = 0; x < source.width - 1; x++) {
      const d = Math.abs((lum[row + x + 1] ?? 0) - (lum[row + x] ?? 0));
      colEdges[x] = (colEdges[x] ?? 0) + d;
      if (y < source.height - 1) {
        const dv = Math.abs((lum[row + source.width + x] ?? 0) - (lum[row + x] ?? 0));
        rowEdges[y] = (rowEdges[y] ?? 0) + dv;
      }
    }
  }

  const xFit = bestAxisFit(colEdges);
  const yFit = bestAxisFit(rowEdges);
  if (!xFit || !yFit) return null;

  // A real chart has near-square-ish cells in source pixels; wildly different pitches mean
  // the two axes latched onto unrelated structures.
  const pitchRatio = xFit.pitch / yFit.pitch;
  if (pitchRatio < 0.5 || pitchRatio > 2) return null;

  const cellsAcross = xFit.lines - 1;
  const cellsDown = yFit.lines - 1;
  if (
    cellsAcross < MIN_LINES - 1 ||
    cellsDown < MIN_LINES - 1 ||
    cellsAcross > MAX_CELLS ||
    cellsDown > MAX_CELLS
  ) {
    return null;
  }

  // Crop from the first detected line to the last, so even cell partitioning lines up with
  // the chart's own cells.
  const x0 = Math.max(0, Math.round(xFit.phase));
  const y0 = Math.max(0, Math.round(yFit.phase));
  const width = Math.min(source.width - x0, Math.round(cellsAcross * xFit.pitch));
  const height = Math.min(source.height - y0, Math.round(cellsDown * yFit.pitch));
  if (width < 1 || height < 1) return null;

  return {
    cellsAcross,
    cellsDown,
    crop: { x: x0, y: y0, width, height },
  };
}

function luminance(source: PixelBuffer): Float64Array {
  const out = new Float64Array(source.width * source.height);
  const { data } = source;
  for (let i = 0; i < out.length; i++) {
    const o = i * 4;
    out[i] = 0.299 * (data[o] ?? 0) + 0.587 * (data[o + 1] ?? 0) + 0.114 * (data[o + 2] ?? 0);
  }
  return out;
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

function bestAxisFit(profile: Float64Array): AxisFit | null {
  const len = profile.length;
  let mean = 0;
  for (const v of profile) mean += v;
  mean /= len;
  if (mean <= 0) return null;

  const maxPitch = len / MIN_LINES;
  const candidates: AxisFit[] = [];

  for (let pitch = MIN_PITCH; pitch <= maxPitch; pitch += 0.25) {
    const phaseStep = Math.max(0.5, pitch * 0.05);
    for (let phase = 0; phase < pitch; phase += phaseStep) {
      let sum = 0;
      let lines = 0;
      let hits = 0;
      for (let x = phase; x < len; x += pitch) {
        const energy = positionEnergy(profile, Math.round(x));
        sum += energy;
        lines++;
        if (energy > mean * 2) hits++;
      }
      if (lines < MIN_LINES) continue;
      // A real grid puts a line at (nearly) EVERY position — a lone strong content edge
      // (e.g. one color boundary) must not read as a grid however strong it is.
      if (hits / lines < 0.8) continue;
      const score = sum / lines / mean;
      candidates.push({ pitch, phase, score, lines });
    }
  }
  if (candidates.length === 0) return null;

  let bestScore = 0;
  for (const c of candidates) if (c.score > bestScore) bestScore = c.score;
  if (bestScore < MIN_SCORE) return null;

  // Integer multiples of the true pitch score just as well (every sampled position is still a
  // line), so among near-best fits take the SMALLEST pitch — the fundamental.
  let best: AxisFit | null = null;
  for (const c of candidates) {
    if (c.score >= bestScore * 0.92 && (!best || c.pitch < best.pitch)) best = c;
  }
  return best;
}

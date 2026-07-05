import type { RGB } from '../types.js';
import { labDistanceSq, rgbToLab } from '../color/lab.js';

/**
 * Seamless tiling via minimum-error-boundary-cut (the seam step of Efros–Freeman image
 * quilting), replacing straight cross-fades: the motif is sampled with a few EXTRA columns/
 * rows of real source content past its edge, and a dynamic-programming seam merges that
 * continuation with the opposite edge along the path where they match best. The join then
 * follows natural edges in the content instead of smearing a straight band across it.
 *
 * Deterministic: fixed tie-breaking (prefer the smaller index), no RNG.
 */

/** Extra columns/rows to oversample for the seam overlap on an axis of the given target
 * length. 0 means the axis is too small to quilt (callers fall back to blend). */
export function quiltOverlap(targetLength: number): number {
  if (targetLength < 10) return 0;
  return Math.min(8, Math.floor(targetLength / 5));
}

function labDistSq(a: RGB, b: RGB): number {
  return labDistanceSq(rgbToLab(a), rgbToLab(b));
}

/**
 * Finds the minimum-cost vertical path through an `overlap`-wide error surface of `rows`
 * rows, moving at most one column per row. The path is constrained to [1, overlap-1] so the
 * merged strip's first texel always comes from the continuation and its last from the
 * opposite edge — that is what makes the wrap join exact.
 */
function minErrorSeam(error: number[][], rows: number, overlap: number): number[] {
  const lo = 1;
  const hi = overlap - 1;
  const cost: number[][] = [];
  for (let y = 0; y < rows; y++) {
    const row = new Array<number>(overlap).fill(Infinity);
    for (let i = lo; i <= hi; i++) {
      const here = error[y]?.[i] ?? 0;
      if (y === 0) {
        row[i] = here;
      } else {
        const prev = cost[y - 1] ?? [];
        let best = Infinity;
        for (let j = Math.max(lo, i - 1); j <= Math.min(hi, i + 1); j++) {
          const v = prev[j] ?? Infinity;
          if (v < best) best = v;
        }
        row[i] = here + best;
      }
    }
    cost.push(row);
  }

  // Backtrack from the cheapest end cell; ties break toward the smaller index.
  const cuts = new Array<number>(rows).fill(lo);
  let at = lo;
  let bestVal = Infinity;
  for (let i = lo; i <= hi; i++) {
    const v = cost[rows - 1]?.[i] ?? Infinity;
    if (v < bestVal) {
      bestVal = v;
      at = i;
    }
  }
  cuts[rows - 1] = at;
  for (let y = rows - 2; y >= 0; y--) {
    const row = cost[y] ?? [];
    let next = at;
    let nextVal = Infinity;
    for (let j = Math.max(lo, at - 1); j <= Math.min(hi, at + 1); j++) {
      const v = row[j] ?? Infinity;
      if (v < nextVal) {
        nextVal = v;
        next = j;
      }
    }
    at = next;
    cuts[y] = at;
  }
  return cuts;
}

function averageColor(a: RGB, b: RGB): RGB {
  return {
    r: Math.round((a.r + b.r) / 2),
    g: Math.round((a.g + b.g) / 2),
    b: Math.round((a.b + b.b) / 2),
  };
}

/**
 * Merges an oversampled grid down to `targetW` x `targetH`, seam-cutting each oversampled
 * axis so the result tiles without a visible join.
 *
 * Layout contract: `samples` is `(targetW + kx) x (targetH + ky)` where the extra columns/
 * rows are the CONTINUATION of the motif in the source image (sampled past its right/bottom
 * edge). For the horizontal join, the continuation columns `[W .. W+kx-1]` are overlapped
 * with the motif's left columns `[0 .. kx-1]` and cut along the best seam; the merged strip
 * becomes the output's left edge, so the output's right edge (pure motif content) flows into
 * it exactly as it did in the source. Vertical works the same way, transposed, after the
 * horizontal merge.
 */
export function quiltSeamless(
  samples: readonly RGB[],
  sampledW: number,
  sampledH: number,
  targetW: number,
  targetH: number,
): RGB[] {
  if (samples.length !== sampledW * sampledH) {
    throw new Error(`samples length ${samples.length} != ${sampledW}x${sampledH}`);
  }
  const kx = sampledW - targetW;
  const ky = sampledH - targetH;
  if (kx < 0 || ky < 0) throw new Error('sampled dimensions must be >= target dimensions');

  const at = (grid: readonly RGB[], w: number, x: number, y: number): RGB =>
    grid[y * w + x] ?? { r: 0, g: 0, b: 0 };

  // --- horizontal: merge continuation columns [W..W+kx-1] with left columns [0..kx-1] ---
  let width = sampledW;
  let grid: RGB[] = samples.slice();
  if (kx >= 2) {
    const rows = sampledH;
    const error: number[][] = [];
    for (let y = 0; y < rows; y++) {
      const row: number[] = [];
      for (let i = 0; i < kx; i++) {
        row.push(labDistSq(at(grid, width, targetW + i, y), at(grid, width, i, y)));
      }
      error.push(row);
    }
    const cuts = minErrorSeam(error, rows, kx);
    const out: RGB[] = new Array<RGB>(targetW * rows);
    for (let y = 0; y < rows; y++) {
      const cut = cuts[y] ?? 1;
      for (let i = 0; i < kx; i++) {
        const cont = at(grid, width, targetW + i, y);
        const edge = at(grid, width, i, y);
        // Continuation before the cut, opposite edge after; one softened texel at the cut.
        out[y * targetW + i] = i < cut ? cont : i === cut ? averageColor(cont, edge) : edge;
      }
      for (let x = kx; x < targetW; x++) {
        out[y * targetW + x] = at(grid, width, x, y);
      }
    }
    grid = out;
    width = targetW;
  } else if (kx === 1) {
    // Degenerate overlap: just drop the single continuation column.
    const out: RGB[] = new Array<RGB>(targetW * sampledH);
    for (let y = 0; y < sampledH; y++) {
      for (let x = 0; x < targetW; x++) out[y * targetW + x] = at(grid, width, x, y);
    }
    grid = out;
    width = targetW;
  }

  // --- vertical: same construction on rows ---
  if (ky >= 2) {
    const error: number[][] = [];
    for (let x = 0; x < width; x++) {
      const col: number[] = [];
      for (let i = 0; i < ky; i++) {
        col.push(labDistSq(at(grid, width, x, targetH + i), at(grid, width, x, i)));
      }
      error.push(col);
    }
    const cuts = minErrorSeam(error, width, ky);
    const out: RGB[] = new Array<RGB>(width * targetH);
    for (let x = 0; x < width; x++) {
      const cut = cuts[x] ?? 1;
      for (let i = 0; i < ky; i++) {
        const cont = at(grid, width, x, targetH + i);
        const edge = at(grid, width, x, i);
        out[i * width + x] = i < cut ? cont : i === cut ? averageColor(cont, edge) : edge;
      }
      for (let y = ky; y < targetH; y++) {
        out[y * width + x] = at(grid, width, x, y);
      }
    }
    grid = out;
  } else if (ky === 1) {
    grid = grid.slice(0, width * targetH);
  }

  return grid;
}

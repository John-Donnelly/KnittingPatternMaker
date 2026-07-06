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
 * Makes a motif tile along an axis WITHOUT any extra source content, by splicing a patch of
 * the motif's own interior across the wrap join (classic Efros–Freeman texture synthesis,
 * applied to the one join that matters). The patch is chosen as the interior strip whose two
 * halves best match the motif's two edges; each half is then seam-cut into its edge. When
 * tiled, the join itself shows the patch's interior adjacency — real, continuous content —
 * instead of a cross-faded band (which quantizes into visible mush) or a hard cut.
 *
 * Used when the crop cannot be extended for continuation content (chart scans that span the
 * whole source image). Deterministic: argmin patch search with lowest-index tie-breaking,
 * same DP seams as quiltSeamless.
 */
/** True when an axis of this length can take an interior wrap patch (needs 4x the overlap). */
export function canWrapPatch(length: number): boolean {
  return Math.min(quiltOverlap(length), Math.floor(length / 4)) >= 2;
}

export function quiltWrapPatch(
  samples: readonly RGB[],
  width: number,
  height: number,
  axes: { horizontal: boolean; vertical: boolean },
): RGB[] {
  if (samples.length !== width * height) {
    throw new Error(`samples length ${samples.length} != ${width}x${height}`);
  }
  let grid = samples.slice();
  if (axes.horizontal) grid = wrapPatchAxis(grid, width, height, true);
  if (axes.vertical) grid = wrapPatchAxis(grid, width, height, false);
  return grid;
}

function wrapPatchAxis(grid: RGB[], width: number, height: number, horizontal: boolean): RGB[] {
  const len = horizontal ? width : height; // along the axis being joined
  const lines = horizontal ? height : width; // perpendicular extent
  const k = Math.min(quiltOverlap(len), Math.floor(len / 4));
  if (k < 2) return grid;

  const at = (pos: number, line: number): RGB =>
    (horizontal ? grid[line * width + pos] : grid[pos * width + line]) ?? { r: 0, g: 0, b: 0 };
  const setAt = (out: RGB[], pos: number, line: number, c: RGB): void => {
    if (horizontal) out[line * width + pos] = c;
    else out[pos * width + line] = c;
  };

  const labs = grid.map((c) => rgbToLab(c));
  type Lab = ReturnType<typeof rgbToLab>;
  const labAt = (pos: number, line: number): Lab =>
    (horizontal ? labs[line * width + pos] : labs[pos * width + line]) ?? { l: 0, a: 0, b: 0 };

  // --- pick the interior patch (2k wide) whose halves best match the two edges ------------
  // Edge zones: R = last k positions (must flow into the patch's left half at the join),
  // L = first k positions (the patch's right half must flow into them).
  let bestStart = k;
  let bestCost = Infinity;
  for (let p = k; p + 2 * k <= len - k; p++) {
    let cost = 0;
    for (let line = 0; line < lines; line++) {
      for (let i = 0; i < k; i++) {
        cost += labDistanceSq(labAt(p + i, line), labAt(len - k + i, line));
        cost += labDistanceSq(labAt(p + k + i, line), labAt(i, line));
      }
    }
    if (cost < bestCost) {
      bestCost = cost;
      bestStart = p;
    }
  }

  // --- seam-cut each patch half into its edge ------------------------------------------------
  // Right edge: original R vs patch's left half; keep original near the interior, patch
  // content at the join.
  const errRight: number[][] = [];
  const errLeft: number[][] = [];
  for (let line = 0; line < lines; line++) {
    const rowR: number[] = [];
    const rowL: number[] = [];
    for (let i = 0; i < k; i++) {
      rowR.push(labDistanceSq(labAt(len - k + i, line), labAt(bestStart + i, line)));
      rowL.push(labDistanceSq(labAt(bestStart + k + i, line), labAt(i, line)));
    }
    errRight.push(rowR);
    errLeft.push(rowL);
  }
  const cutsRight = minErrorSeam(errRight, lines, k);
  const cutsLeft = minErrorSeam(errLeft, lines, k);

  const out = grid.slice();
  for (let line = 0; line < lines; line++) {
    const cr = cutsRight[line] ?? 1;
    const cl = cutsLeft[line] ?? 1;
    for (let i = 0; i < k; i++) {
      // Right edge: original before the cut, patch after — so the last position is pure
      // patch content, whose successor (patch pos bestStart+k) appears at the next tile's
      // first position. The join reproduces the patch's own interior adjacency.
      const right =
        i < cr
          ? at(len - k + i, line)
          : i === cr
            ? averageColor(at(len - k + i, line), at(bestStart + i, line))
            : at(bestStart + i, line);
      setAt(out, len - k + i, line, right);
      // Left edge: patch before the cut, original after.
      const left =
        i < cl
          ? at(bestStart + k + i, line)
          : i === cl
            ? averageColor(at(bestStart + k + i, line), at(i, line))
            : at(i, line);
      setAt(out, i, line, left);
    }
  }
  return out;
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

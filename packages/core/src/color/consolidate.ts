import type { RGB } from '../types.js';
import { labDistanceSq, relativeLuminance, rgbToLab } from './lab.js';

/**
 * Two palette entries closer than this (CIE76 delta-E) read as the *same wool color*: no yarn
 * shop stocks, and no knitter wants to juggle, two yarns a just-noticeable shade apart. The
 * commonly cited perceptual bands: delta-E < 2 is imperceptible, 2-10 is "same color at a
 * glance", > 10 reads as a genuinely different color.
 */
export const WOOL_SHADE_DELTA_E = 10;

export interface ConsolidatedPalette {
  palette: RGB[];
  /** remap[oldPaletteIndex] = index into the new palette. */
  remap: number[];
}

/**
 * Merges palette entries that are perceptually the same shade (CIE76 delta-E below
 * `minDeltaE`) into single "wool colors". Merging is transitive (a chain of near-identical
 * shades collapses into one), and each merged color is the stitch-count-weighted average of
 * its members, so the dominant shade wins and large areas keep the color they actually had.
 * The result is sorted darkest -> lightest (same convention as medianCutPalette).
 * Deterministic: no RNG, fixed iteration order, stable sort keys.
 */
export function consolidatePalette(
  palette: readonly RGB[],
  counts: readonly number[],
  minDeltaE: number = WOOL_SHADE_DELTA_E,
): ConsolidatedPalette {
  if (palette.length !== counts.length) {
    throw new Error(
      `palette length (${palette.length}) must equal counts length (${counts.length})`,
    );
  }
  if (palette.length <= 1) {
    return { palette: palette.slice(), remap: palette.map((_, i) => i) };
  }

  const labs = palette.map((c) => rgbToLab(c));
  const thresholdSq = minDeltaE * minDeltaE;

  // Union-find over the "same shade" graph.
  const parent = palette.map((_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root] ?? root;
    // Path compression (deterministic — result independent of traversal order).
    let cur = i;
    while (parent[cur] !== root) {
      const next = parent[cur] ?? root;
      parent[cur] = root;
      cur = next;
    }
    return root;
  };
  for (let i = 0; i < palette.length; i++) {
    for (let j = i + 1; j < palette.length; j++) {
      const a = labs[i];
      const b = labs[j];
      if (!a || !b) continue;
      if (labDistanceSq(a, b) < thresholdSq) {
        // Union toward the lower root index for a stable, order-independent result.
        const ri = find(i);
        const rj = find(j);
        if (ri !== rj) parent[Math.max(ri, rj)] = Math.min(ri, rj);
      }
    }
  }

  // Weighted-average color per cluster.
  interface Cluster {
    r: number;
    g: number;
    b: number;
    weight: number;
    members: number[];
  }
  const clusters = new Map<number, Cluster>();
  for (let i = 0; i < palette.length; i++) {
    const root = find(i);
    const color = palette[i];
    if (!color) continue;
    // Zero-count colors (possible when a palette entry never won a cell) still merge, with a
    // minimal weight so they can't skew the average away from colors that actually appear.
    const weight = Math.max(counts[i] ?? 0, 1e-9);
    const cluster = clusters.get(root) ?? { r: 0, g: 0, b: 0, weight: 0, members: [] };
    cluster.r += color.r * weight;
    cluster.g += color.g * weight;
    cluster.b += color.b * weight;
    cluster.weight += weight;
    cluster.members.push(i);
    clusters.set(root, cluster);
  }

  const merged = [...clusters.values()].map((c) => ({
    color: {
      r: Math.round(c.r / c.weight),
      g: Math.round(c.g / c.weight),
      b: Math.round(c.b / c.weight),
    },
    members: c.members,
  }));
  merged.sort((a, b) => relativeLuminance(a.color) - relativeLuminance(b.color));

  const remap = new Array<number>(palette.length).fill(0);
  merged.forEach((cluster, newIndex) => {
    for (const member of cluster.members) remap[member] = newIndex;
  });

  return { palette: merged.map((m) => m.color), remap };
}

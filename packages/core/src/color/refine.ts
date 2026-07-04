import type { RGB } from '../types.js';
import type { Lab } from './lab.js';
import { labDistanceSq, relativeLuminance, rgbToLab } from './lab.js';
import { medianCutPalette } from './quantize.js';

/**
 * Adaptive palette refinement on top of plain median-cut.
 *
 * Why: measured on real pixel art and chart scans, raw median-cut has two systematic failures
 * that matter a lot for knitting palettes (where every entry is a physical yarn you buy):
 *
 * 1. **Phantom blends.** Box-average sampling and anti-aliased edges produce cell colors that
 *    lie *between* the real flat colors. Median-cut boxes average those edge blends together
 *    with real clusters, so a palette entry can be a muddy color that appears NOWHERE in the
 *    source (e.g. two black birds + one brown bird collapsing into a single dark-brown entry
 *    ~20 dE away from either real color, while a light-gray bird vanishes into the sky).
 * 2. **Wasted slots.** Median-cut splits by channel range, not by usefulness, so it happily
 *    spends two palette entries on colors ~1-2 dE apart (indistinguishable as yarn) while a
 *    genuinely distinct region has no entry at all.
 *
 * The refinement loop below fixes both with deterministic, pure-function passes:
 *
 * - **Recenter + mode-snap**: reassign all colors to their nearest palette entry (Lab) and
 *   recompute each entry as the weighted mean of its cluster — then, if one exact input color
 *   dominates the cluster, snap the entry to that *actual* color. Flat art therefore gets its
 *   true flat colors back, while photo gradients (no dominant exact color) keep the mean.
 * - **Merge**: entries closer than a just-noticeable yarn difference are merged; nobody buys
 *   two skeins ~4 dE apart.
 * - **Prune**: an entry covering almost nothing whose stitches can be reassigned within a
 *   small dE is dropped. Crucially this can NEVER remove a small-but-distinct accent (an eye,
 *   an outline): those reassign at a large dE and are therefore protected by construction.
 * - **Grow**: freed slots are re-used by splitting the cluster with the largest internal
 *   error (weighted Lab SSE), using the same dominant-gap/median hybrid rule as median-cut.
 * - **Swap**: when the palette is full, an entry that is merely a *mixture* of two other
 *   entries (it sits close to the Lab segment between them — an edge-blend artifact, not an
 *   accent) may be dropped to free a slot for a split that reduces total error by clearly
 *   more than the drop costs. This is what rescues a distinct color that median-cut buried
 *   inside another box.
 *
 * Everything is deterministic: fixed iteration counts, fixed traversal orders, and total-order
 * tie-breaks (lowest index / lowest packed-RGB key). No RNG, no time, no external state.
 */

/**
 * Two palette entries closer than this (CIE76 dE) are merged: at ~4 dE two solid yarn colors
 * are barely distinguishable side by side, so separate entries are wasted slots.
 */
const MERGE_DELTA_E = 4;

/**
 * An entry is snapped to the single most-common exact input color of its cluster when that
 * color accounts for at least this fraction of the cluster's weight. 0.5 means "the majority
 * of stitches in this cluster are literally this color" — snapping then removes the blend
 * bias pulled in by minority edge samples. Photo gradients essentially never repeat an exact
 * color at this fraction, so they keep the (correct-for-them) weighted mean.
 */
const MODE_SNAP_FRACTION = 0.5;

/**
 * Prune threshold: an entry covering less than this fraction of all stitches AND whose
 * members can all be reassigned within {@link PRUNE_MAX_DELTA_E} is dropped. 0.5% of a
 * typical chart is a handful of stitches — not worth a yarn purchase unless the color is
 * genuinely distinct (in which case the dE guard protects it).
 */
const PRUNE_MIN_COVERAGE = 0.005;

/**
 * Prune guard: members of a pruned entry must land within this dE of a surviving entry.
 * ~10 dE is a clearly related shade; anything farther would visibly change the design,
 * so high-contrast accents (eyes, outlines) can never be pruned no matter how small.
 */
const PRUNE_MAX_DELTA_E = 10;

/**
 * A palette entry counts as a "blend artifact" (and is therefore swappable) when it lies
 * within this dE of the straight Lab segment between two OTHER entries, in the middle part
 * of that segment. Box-averaged edge cells produce exactly such in-between colors; a real
 * accent color is never a mixture of two other palette entries.
 */
const BLEND_MAX_SEGMENT_DELTA_E = 8;
/** Middle part of the segment: t outside this range means "near an endpoint", i.e. a
 *  near-duplicate (the merge pass's job), not an in-between blend. */
const BLEND_T_MIN = 0.1;
const BLEND_T_MAX = 0.9;

/**
 * A swap (drop a blend entry + split a high-error cluster) only fires when the split's SSE
 * gain exceeds the drop's SSE cost by this factor. The margin keeps the loop from churning
 * on near-neutral swaps and biases toward keeping existing colors (stability).
 */
const SWAP_GAIN_FACTOR = 1.5;

/**
 * Upper bound on refinement rounds. Each round is one recenter/merge/prune/grow/swap pass;
 * the loop breaks as soon as a round changes nothing. Ten rounds is far more than observed
 * convergence (2-4 on the evaluation set) but guarantees termination.
 */
const MAX_ROUNDS = 10;

/** One exact input color plus how many samples had it. `key` is the packed 24-bit RGB used
 *  for canonical (deterministic) ordering. */
interface WeightedColor {
  rgb: RGB;
  lab: Lab;
  weight: number;
  key: number;
}

interface Cluster {
  members: WeightedColor[];
  weight: number;
}

function packKey({ r, g, b }: RGB): number {
  return (r << 16) | (g << 8) | b;
}

/** Deduplicate samples into weighted unique colors, sorted by packed key (fixed order). */
function uniqueWeightedColors(samples: readonly RGB[]): WeightedColor[] {
  const byKey = new Map<number, WeightedColor>();
  for (const s of samples) {
    const key = packKey(s);
    const existing = byKey.get(key);
    if (existing) {
      existing.weight++;
    } else {
      byKey.set(key, { rgb: { r: s.r, g: s.g, b: s.b }, lab: rgbToLab(s), weight: 1, key });
    }
  }
  return [...byKey.values()].sort((a, b) => a.key - b.key);
}

function weightedMean(members: readonly WeightedColor[]): RGB {
  let r = 0;
  let g = 0;
  let b = 0;
  let w = 0;
  for (const m of members) {
    r += m.rgb.r * m.weight;
    g += m.rgb.g * m.weight;
    b += m.rgb.b * m.weight;
    w += m.weight;
  }
  return { r: Math.round(r / w), g: Math.round(g / w), b: Math.round(b / w) };
}

/**
 * The cluster's representative color: weighted mean, snapped to the modal exact color when
 * that color truly dominates the cluster (see {@link MODE_SNAP_FRACTION}). Tie between two
 * equally-common colors breaks to the lower packed key (members are key-sorted).
 */
function representativeColor(members: readonly WeightedColor[]): RGB {
  let total = 0;
  let top: WeightedColor | undefined;
  for (const m of members) {
    total += m.weight;
    if (!top || m.weight > top.weight) top = m;
  }
  if (top && top.weight >= total * MODE_SNAP_FRACTION) {
    return { ...top.rgb };
  }
  return weightedMean(members);
}

/** Weighted Lab sum of squared errors of `members` around `center`. */
function clusterSSE(members: readonly WeightedColor[], center: Lab): number {
  let sse = 0;
  for (const m of members) {
    sse += m.weight * labDistanceSq(m.lab, center);
  }
  return sse;
}

type Channel = 'r' | 'g' | 'b';
const CHANNELS: readonly Channel[] = ['r', 'g', 'b'];

/**
 * Splits a cluster's members in two along its widest RGB channel using the same hybrid
 * dominant-gap/median rule as `medianCutPalette` (see that function for the full rationale),
 * except weights replace sample duplication: the fallback split point is the *weighted*
 * median so heavily-used colors count as many stitches, not one.
 *
 * Returns null when the cluster has fewer than two distinct colors (nothing to split).
 */
function splitMembers(
  members: readonly WeightedColor[],
): [WeightedColor[], WeightedColor[]] | null {
  if (members.length < 2) return null;

  // Widest channel; fixed (r, g, b) evaluation order makes ties deterministic.
  let channel: Channel = 'r';
  let bestRange = -1;
  for (const c of CHANNELS) {
    let min = Infinity;
    let max = -Infinity;
    for (const m of members) {
      const v = m.rgb[c];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (max - min > bestRange) {
      bestRange = max - min;
      channel = c;
    }
  }

  const sorted = members.slice().sort((a, b) => a.rgb[channel] - b.rgb[channel] || a.key - b.key);

  // Weighted median index: first boundary where the left side holds at least half the weight
  // (clamped so both sides stay non-empty).
  let totalWeight = 0;
  for (const m of sorted) totalWeight += m.weight;
  let cum = 0;
  let weightedMedian = sorted.length - 1;
  for (let i = 0; i < sorted.length - 1; i++) {
    const m = sorted[i];
    if (m) cum += m.weight;
    if (cum >= totalWeight / 2) {
      weightedMedian = i + 1;
      break;
    }
  }
  weightedMedian = Math.max(1, Math.min(sorted.length - 1, weightedMedian));

  // Dominant-gap detection, tie-broken toward the weighted median (then the lower index).
  let widestGap = -1;
  let gapSum = 0;
  let gapSplitAt = -1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (!prev || !cur) continue;
    const gap = cur.rgb[channel] - prev.rgb[channel];
    gapSum += gap;
    if (
      gap > widestGap ||
      (gap === widestGap && Math.abs(i - weightedMedian) < Math.abs(gapSplitAt - weightedMedian))
    ) {
      widestGap = gap;
      gapSplitAt = i;
    }
  }
  const meanGap = gapSum / (sorted.length - 1);
  const splitAt = gapSplitAt > 0 && widestGap >= meanGap * 2 ? gapSplitAt : weightedMedian;

  return [sorted.slice(0, splitAt), sorted.slice(splitAt)];
}

/**
 * Assigns every unique color to its nearest center (CIE76 Lab; ties break to the lowest
 * center index). Empty clusters are dropped, so the result can be shorter than `centers`.
 */
function assignClusters(uniques: readonly WeightedColor[], centers: readonly RGB[]): Cluster[] {
  const centerLabs = centers.map(rgbToLab);
  const clusters: Cluster[] = centers.map(() => ({ members: [], weight: 0 }));
  for (const u of uniques) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < centerLabs.length; i++) {
      const lab = centerLabs[i];
      if (!lab) continue;
      const d = labDistanceSq(u.lab, lab);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const cluster = clusters[bestIdx];
    if (cluster) {
      cluster.members.push(u);
      cluster.weight += u.weight;
    }
  }
  return clusters.filter((c) => c.members.length > 0);
}

/**
 * True when center `k` is an in-between mixture of two other centers: within
 * {@link BLEND_MAX_SEGMENT_DELTA_E} of the straight Lab segment between some pair, in the
 * middle part of the segment. Such colors read as edge transitions, not intentional accents,
 * so they are safe to sacrifice in a swap.
 */
function isBlendOfOthers(k: number, labs: readonly Lab[]): boolean {
  const p = labs[k];
  if (!p) return false;
  const maxDistSq = BLEND_MAX_SEGMENT_DELTA_E * BLEND_MAX_SEGMENT_DELTA_E;
  for (let i = 0; i < labs.length; i++) {
    if (i === k) continue;
    const a = labs[i];
    if (!a) continue;
    for (let j = i + 1; j < labs.length; j++) {
      if (j === k) continue;
      const b = labs[j];
      if (!b) continue;
      const vl = b.l - a.l;
      const va = b.a - a.a;
      const vb = b.b - a.b;
      const lenSq = vl * vl + va * va + vb * vb;
      if (lenSq === 0) continue;
      const t = ((p.l - a.l) * vl + (p.a - a.a) * va + (p.b - a.b) * vb) / lenSq;
      if (t < BLEND_T_MIN || t > BLEND_T_MAX) continue;
      const dl = p.l - (a.l + t * vl);
      const da = p.a - (a.a + t * va);
      const db = p.b - (a.b + t * vb);
      if (dl * dl + da * da + db * db <= maxDistSq) return true;
    }
  }
  return false;
}

/**
 * Repeatedly merges the closest pair of centers under {@link MERGE_DELTA_E} — closest pair
 * first, ties broken to the lowest index pair — so chained merges stay order-independent
 * and deterministic. Mutates both arrays in place; returns `centers` for convenience.
 */
function mergeNearDuplicates(clusters: Cluster[], centers: RGB[]): RGB[] {
  for (;;) {
    const labs = centers.map(rgbToLab);
    let bi = -1;
    let bj = -1;
    let bestD = MERGE_DELTA_E * MERGE_DELTA_E;
    for (let i = 0; i < centers.length; i++) {
      for (let j = i + 1; j < centers.length; j++) {
        const li = labs[i];
        const lj = labs[j];
        if (!li || !lj) continue;
        const d = labDistanceSq(li, lj);
        if (d < bestD) {
          bestD = d;
          bi = i;
          bj = j;
        }
      }
    }
    if (bi < 0) break;
    const a = clusters[bi];
    const b = clusters[bj];
    if (!a || !b) break;
    const mergedMembers = [...a.members, ...b.members].sort((x, y) => x.key - y.key);
    clusters.splice(bj, 1);
    clusters[bi] = { members: mergedMembers, weight: a.weight + b.weight };
    centers.splice(bj, 1);
    centers[bi] = representativeColor(mergedMembers);
  }
  return centers;
}

/**
 * Builds a palette of at most `maxColors` colors for `samples` using median-cut followed by
 * the deterministic refinement loop documented at the top of this file. May return FEWER
 * than `maxColors` entries when the source genuinely doesn't need them (near-duplicate or
 * negligible colors are merged/pruned rather than kept as wasted slots).
 *
 * Ordered darkest to lightest like {@link medianCutPalette} (stable legend ordering).
 */
export function adaptivePalette(samples: readonly RGB[], maxColors: number): RGB[] {
  if (maxColors < 1) {
    throw new Error(`maxColors must be >= 1, got ${maxColors}`);
  }
  if (samples.length === 0) {
    throw new Error('Cannot build a palette from zero samples');
  }

  const uniques = uniqueWeightedColors(samples);
  let totalWeight = 0;
  for (const u of uniques) totalWeight += u.weight;

  // Fewer distinct colors than slots: the exact colors ARE the palette (same behavior as
  // medianCutPalette, which cannot split single-color boxes) — except that twins closer
  // than the yarn-distinguishability threshold are still merged: two entries ~1 dE apart
  // are a wasted slot (and a pointless extra skein) no matter how few colors there are.
  if (uniques.length <= maxColors) {
    const exact = mergeNearDuplicates(
      uniques.map((u) => ({ members: [u], weight: u.weight })),
      uniques.map((u) => ({ ...u.rgb })),
    );
    return exact.sort((a, b) => relativeLuminance(a) - relativeLuminance(b));
  }

  let centers: RGB[] = medianCutPalette(samples, maxColors);
  let previousSignature = '';

  for (let round = 0; round < MAX_ROUNDS; round++) {
    // ---- Recenter + mode-snap -------------------------------------------------------------
    const clusters = assignClusters(uniques, centers);
    centers = clusters.map((c) => representativeColor(c.members));

    // ---- Merge near-duplicates ------------------------------------------------------------
    mergeNearDuplicates(clusters, centers);

    // ---- Prune negligible near-redundant entries -------------------------------------------
    // Drop entries covering < PRUNE_MIN_COVERAGE whose members all fit within
    // PRUNE_MAX_DELTA_E of some other entry. Distinct accents fail the dE guard and survive.
    if (centers.length > 1) {
      for (;;) {
        const labs = centers.map(rgbToLab);
        let dropIdx = -1;
        for (let k = 0; k < clusters.length; k++) {
          const cluster = clusters[k];
          if (!cluster || cluster.weight >= totalWeight * PRUNE_MIN_COVERAGE) continue;
          let worst = 0;
          for (const m of cluster.members) {
            let best = Infinity;
            for (let i = 0; i < labs.length; i++) {
              if (i === k) continue;
              const lab = labs[i];
              if (!lab) continue;
              const d = labDistanceSq(m.lab, lab);
              if (d < best) best = d;
            }
            if (best > worst) worst = best;
          }
          if (worst <= PRUNE_MAX_DELTA_E * PRUNE_MAX_DELTA_E) {
            dropIdx = k;
            break; // lowest index first: deterministic
          }
        }
        if (dropIdx < 0 || centers.length <= 1) break;
        clusters.splice(dropIdx, 1);
        centers.splice(dropIdx, 1);
        // Members of the dropped cluster are re-absorbed by the next round's reassignment.
      }
    }

    // ---- Grow into free slots ---------------------------------------------------------------
    // Merging/pruning (or empty clusters) freed slots: spend them on the clusters with the
    // largest weighted Lab SSE — the places where the palette is currently worst. A split
    // whose two representatives would land within the merge tolerance is skipped (`blocked`):
    // performing it would just undo a merge and oscillate until the round limit.
    const blocked = new Set<number>();
    while (centers.length < maxColors) {
      let bestIdx = -1;
      let bestSSE = 0;
      for (let i = 0; i < clusters.length; i++) {
        const c = clusters[i];
        if (!c || c.members.length < 2 || blocked.has(i)) continue;
        const sse = clusterSSE(c.members, rgbToLab(centers[i] ?? weightedMean(c.members)));
        if (sse > bestSSE) {
          bestSSE = sse;
          bestIdx = i;
        }
      }
      if (bestIdx < 0) break;
      const cluster = clusters[bestIdx];
      if (!cluster) break;
      const split = splitMembers(cluster.members);
      if (!split) break;
      const [left, right] = split;
      const leftRep = representativeColor(left);
      const rightRep = representativeColor(right);
      if (labDistanceSq(rgbToLab(leftRep), rgbToLab(rightRep)) < MERGE_DELTA_E * MERGE_DELTA_E) {
        blocked.add(bestIdx);
        continue;
      }
      let leftWeight = 0;
      for (const m of left) leftWeight += m.weight;
      clusters.splice(
        bestIdx,
        1,
        { members: left, weight: leftWeight },
        { members: right, weight: cluster.weight - leftWeight },
      );
      centers.splice(bestIdx, 1, leftRep, rightRep);
      // Indices after the insertion point shifted by one; rebuild the block list to match.
      const shifted = new Set<number>();
      for (const b of blocked) shifted.add(b > bestIdx ? b + 1 : b);
      blocked.clear();
      for (const b of shifted) blocked.add(b);
    }

    // ---- Swap: sacrifice a blend artifact for a badly-needed split ---------------------------
    // Only when the palette is full (otherwise grow already did the job) and only when the
    // entry being dropped is a mixture of two other entries — never a distinct accent.
    if (centers.length === maxColors && centers.length >= 3) {
      const labs = centers.map(rgbToLab);

      // Cheapest droppable blend (SSE increase from reassigning its members elsewhere).
      let dropIdx = -1;
      let dropCost = Infinity;
      for (let k = 0; k < centers.length; k++) {
        if (!isBlendOfOthers(k, labs)) continue;
        const cluster = clusters[k];
        const own = labs[k];
        if (!cluster || !own) continue;
        let cost = 0;
        for (const m of cluster.members) {
          let best = Infinity;
          for (let i = 0; i < labs.length; i++) {
            if (i === k) continue;
            const lab = labs[i];
            if (!lab) continue;
            const d = labDistanceSq(m.lab, lab);
            if (d < best) best = d;
          }
          cost += m.weight * (best - labDistanceSq(m.lab, own));
        }
        if (cost < dropCost) {
          dropCost = cost;
          dropIdx = k;
        }
      }

      if (dropIdx >= 0) {
        // Most valuable split among the OTHER clusters.
        let splitIdx = -1;
        let splitGain = 0;
        for (let i = 0; i < clusters.length; i++) {
          if (i === dropIdx) continue;
          const c = clusters[i];
          const lab = labs[i];
          if (!c || !lab || c.members.length < 2) continue;
          const split = splitMembers(c.members);
          if (!split) continue;
          const [left, right] = split;
          // Same anti-oscillation guard as the grow step: a split into two colors that
          // would immediately re-merge is worthless.
          if (
            labDistanceSq(
              rgbToLab(representativeColor(left)),
              rgbToLab(representativeColor(right)),
            ) <
            MERGE_DELTA_E * MERGE_DELTA_E
          ) {
            continue;
          }
          const gain =
            clusterSSE(c.members, lab) -
            clusterSSE(left, rgbToLab(weightedMean(left))) -
            clusterSSE(right, rgbToLab(weightedMean(right)));
          if (gain > splitGain) {
            splitGain = gain;
            splitIdx = i;
          }
        }

        if (splitIdx >= 0 && splitGain > dropCost * SWAP_GAIN_FACTOR) {
          const cluster = clusters[splitIdx];
          const split = cluster ? splitMembers(cluster.members) : null;
          if (cluster && split) {
            const [left, right] = split;
            let leftWeight = 0;
            for (const m of left) leftWeight += m.weight;
            clusters.splice(
              splitIdx,
              1,
              { members: left, weight: leftWeight },
              { members: right, weight: cluster.weight - leftWeight },
            );
            centers.splice(splitIdx, 1, representativeColor(left), representativeColor(right));
            // Indices shifted if the split happened before the drop target.
            const adjustedDrop = dropIdx > splitIdx ? dropIdx + 1 : dropIdx;
            clusters.splice(adjustedDrop, 1);
            centers.splice(adjustedDrop, 1);
          }
        }
      }
    }

    // ---- Convergence check --------------------------------------------------------------
    // Canonical signature (key-sorted) so the loop stops as soon as a round is a no-op.
    const signature = centers
      .map(packKey)
      .sort((a, b) => a - b)
      .join(',');
    if (signature === previousSignature) break;
    previousSignature = signature;
  }

  return centers.map((c) => ({ ...c })).sort((a, b) => relativeLuminance(a) - relativeLuminance(b));
}

import type { RGB } from '../types.js';
import { relativeLuminance } from './lab.js';

type Channel = 'r' | 'g' | 'b';
const CHANNELS: readonly Channel[] = ['r', 'g', 'b'];

interface Box {
  points: RGB[];
}

function channelRange(points: readonly RGB[], channel: Channel): number {
  let min = Infinity;
  let max = -Infinity;
  for (const p of points) {
    const v = p[channel];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return max - min;
}

function widestChannel(points: readonly RGB[]): Channel {
  // Fixed evaluation order (r, g, b) makes ties deterministic: the first channel
  // reaching the max range wins.
  let best: Channel = 'r';
  let bestRange = -1;
  for (const channel of CHANNELS) {
    const range = channelRange(points, channel);
    if (range > bestRange) {
      bestRange = range;
      best = channel;
    }
  }
  return best;
}

function isSingleColor(points: readonly RGB[]): boolean {
  const first = points[0];
  if (!first) return true;
  return points.every((p) => p.r === first.r && p.g === first.g && p.b === first.b);
}

function averageColor(points: readonly RGB[]): RGB {
  let r = 0;
  let g = 0;
  let b = 0;
  for (const p of points) {
    r += p.r;
    g += p.g;
    b += p.b;
  }
  const n = points.length;
  return {
    r: Math.round(r / n),
    g: Math.round(g / n),
    b: Math.round(b / n),
  };
}

/**
 * Deterministic median-cut color quantization. No randomness: box selection, the split
 * channel, and the split point are all derived from fixed, total-order comparisons, and
 * JS's Array#sort is stable (ES2019+), so repeated runs on the same input always split
 * boxes identically.
 *
 * Returns at most `maxColors` colors, ordered darkest to lightest (stable, review-friendly
 * legend ordering independent of median-cut's internal box order).
 */
export function medianCutPalette(samples: readonly RGB[], maxColors: number): RGB[] {
  if (maxColors < 1) {
    throw new Error(`maxColors must be >= 1, got ${maxColors}`);
  }
  if (samples.length === 0) {
    throw new Error('Cannot build a palette from zero samples');
  }

  const boxes: Box[] = [{ points: samples.slice() }];

  while (boxes.length < maxColors) {
    // Pick the splittable box (more than one unique color) with the widest range.
    // Ties broken by earliest index, i.e. insertion/creation order, for determinism.
    let splitIndex = -1;
    let splitRange = -1;
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      if (!box || box.points.length < 2 || isSingleColor(box.points)) continue;
      const channel = widestChannel(box.points);
      const range = channelRange(box.points, channel);
      if (range > splitRange) {
        splitRange = range;
        splitIndex = i;
      }
    }

    if (splitIndex === -1) break; // every remaining box is a single color; can't split further

    const box = boxes[splitIndex];
    if (!box) break;
    const channel = widestChannel(box.points);
    const sorted = box.points
      .slice()
      .sort((a, b) => a[channel] - b[channel] || a.r - b.r || a.g - b.g || a.b - b.b);

    // Hybrid split point:
    //
    // - If the sorted values contain a DOMINANT gap (at least twice the box's mean adjacent
    //   gap), split there: index-median splitting balances sample *count*, which can slice a
    //   genuinely separated cluster in half while merging two unrelated clusters together
    //   (e.g. a flat red/blue flag: the median would lump part of red with blue into a muddy
    //   purple that appears nowhere in the source). Ties between equal dominant gaps break
    //   toward the median index (then the lower index) so the split stays balanced.
    // - Otherwise — smooth content like a photo gradient, where every adjacent gap is about
    //   the same — fall back to the median index. Always taking the first-largest gap here
    //   degenerates badly: on a uniform ramp all gaps tie, the first one wins, and each split
    //   peels a sliver off one end instead of halving the box, cramming most of the palette
    //   into one corner of the range.
    let widestGap = -1;
    let gapSum = 0;
    let gapSplitAt = -1;
    const median = sorted.length / 2;
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      if (!prev || !cur) continue;
      const gap = cur[channel] - prev[channel];
      gapSum += gap;
      if (
        gap > widestGap ||
        (gap === widestGap && Math.abs(i - median) < Math.abs(gapSplitAt - median))
      ) {
        widestGap = gap;
        gapSplitAt = i;
      }
    }
    const meanGap = gapSum / (sorted.length - 1);
    const splitAt =
      gapSplitAt > 0 && widestGap >= meanGap * 2 ? gapSplitAt : Math.ceil(sorted.length / 2);

    boxes.splice(
      splitIndex,
      1,
      { points: sorted.slice(0, splitAt) },
      { points: sorted.slice(splitAt) },
    );
  }

  return boxes
    .map((box) => averageColor(box.points))
    .sort((a, b) => relativeLuminance(a) - relativeLuminance(b));
}

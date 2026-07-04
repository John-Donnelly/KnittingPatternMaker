import type { Grid, QuantizeOptions, RGB } from '../types.js';
import { medianCutPalette } from '../color/quantize.js';
import { consolidatePalette } from '../color/consolidate.js';
import { nearestColorIndex } from '../color/nearest.js';
import { ditherBayer4, ditherFloydSteinberg } from './dither.js';

/**
 * Builds a deterministic palette (median-cut, from the true un-dithered colors), merges
 * perceptually-identical entries into single "wool colors" (see consolidatePalette — median
 * cut on photographic input otherwise splits one perceived color into several near-identical
 * shades no yarn shop distinguishes), and maps every sample to a palette index using the
 * requested dither mode.
 */
export function quantizeGrid(
  samples: readonly RGB[],
  width: number,
  height: number,
  options: QuantizeOptions,
): Grid {
  if (samples.length !== width * height) {
    throw new Error(
      `samples length (${samples.length}) must equal width*height (${width * height})`,
    );
  }

  const rawPalette = medianCutPalette(samples, options.maxColors);

  // Weight each raw palette entry by how many cells it actually wins, so the merged wool
  // color is dominated by the shade that covers the most fabric.
  const counts = new Array<number>(rawPalette.length).fill(0);
  if (rawPalette.length > 1) {
    for (const sample of samples) {
      const idx = nearestColorIndex(sample, rawPalette);
      counts[idx] = (counts[idx] ?? 0) + 1;
    }
  }
  const { palette } = consolidatePalette(rawPalette, counts);

  let indices: Uint16Array;
  switch (options.dither) {
    case 'none':
      indices = new Uint16Array(width * height);
      for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        if (!s) continue;
        indices[i] = nearestColorIndex(s, palette);
      }
      break;
    case 'bayer4':
      indices = ditherBayer4(samples, width, height, palette);
      break;
    case 'floyd-steinberg':
      indices = ditherFloydSteinberg(samples, width, height, palette);
      break;
  }

  return { width, height, indices, palette };
}

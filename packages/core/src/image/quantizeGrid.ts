import type { Grid, QuantizeOptions, RGB } from '../types.js';
import { medianCutPalette } from '../color/quantize.js';
import { nearestColorIndex } from '../color/nearest.js';
import { ditherBayer4, ditherFloydSteinberg } from './dither.js';

/**
 * Builds a deterministic palette (median-cut, from the true un-dithered colors) and maps
 * every sample to a palette index using the requested dither mode.
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

  const palette = medianCutPalette(samples, options.maxColors);

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

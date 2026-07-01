import type { RGB } from '../types.js';
import { nearestColorIndex } from '../color/nearest.js';

/** Standard 4x4 ordered (Bayer) dither threshold matrix, values 0-15. */
const BAYER_4X4: readonly (readonly number[])[] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, v));
}

/**
 * Ordered (Bayer) dithering: perturbs each pixel by a fixed, position-dependent amount
 * before nearest-palette lookup. Purely a function of pixel position and color (no
 * accumulated state), so it is embarrassingly deterministic and parallelizable.
 */
export function ditherBayer4(
  samples: readonly RGB[],
  width: number,
  height: number,
  palette: readonly RGB[],
): Uint16Array {
  // Perturbation amplitude shrinks as the palette grows: a denser palette needs a smaller
  // nudge to cross into a neighboring bucket.
  const amplitude = 255 / (palette.length + 1);
  const indices = new Uint16Array(width * height);

  for (let y = 0; y < height; y++) {
    const bayerRow = BAYER_4X4[y % 4];
    for (let x = 0; x < width; x++) {
      const threshold = bayerRow?.[x % 4] ?? 0;
      const t = (threshold + 0.5) / 16 - 0.5; // in [-0.5, 0.5)
      const sample = samples[y * width + x];
      if (!sample) continue;
      const perturbed: RGB = {
        r: clamp255(sample.r + t * amplitude),
        g: clamp255(sample.g + t * amplitude),
        b: clamp255(sample.b + t * amplitude),
      };
      indices[y * width + x] = nearestColorIndex(perturbed, palette);
    }
  }

  return indices;
}

/**
 * Floyd-Steinberg error-diffusion dithering. Processes pixels in a fixed row-major raster
 * order and diffuses quantization error to not-yet-visited neighbors with the classic
 * 7/16, 3/16, 5/16, 1/16 weights, so results are byte-identical across runs.
 */
export function ditherFloydSteinberg(
  samples: readonly RGB[],
  width: number,
  height: number,
  palette: readonly RGB[],
): Uint16Array {
  const bufR = new Float64Array(width * height);
  const bufG = new Float64Array(width * height);
  const bufB = new Float64Array(width * height);
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (!s) continue;
    bufR[i] = s.r;
    bufG[i] = s.g;
    bufB[i] = s.b;
  }

  const indices = new Uint16Array(width * height);

  const addError = (x: number, y: number, er: number, eg: number, eb: number, weight: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const i = y * width + x;
    bufR[i] = (bufR[i] ?? 0) + er * weight;
    bufG[i] = (bufG[i] ?? 0) + eg * weight;
    bufB[i] = (bufB[i] ?? 0) + eb * weight;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const oldR = clamp255(bufR[i] ?? 0);
      const oldG = clamp255(bufG[i] ?? 0);
      const oldB = clamp255(bufB[i] ?? 0);

      const idx = nearestColorIndex({ r: oldR, g: oldG, b: oldB }, palette);
      indices[i] = idx;
      const chosen = palette[idx];
      if (!chosen) continue;

      const errR = oldR - chosen.r;
      const errG = oldG - chosen.g;
      const errB = oldB - chosen.b;

      addError(x + 1, y, errR, errG, errB, 7 / 16);
      addError(x - 1, y + 1, errR, errG, errB, 3 / 16);
      addError(x, y + 1, errR, errG, errB, 5 / 16);
      addError(x + 1, y + 1, errR, errG, errB, 1 / 16);
    }
  }

  return indices;
}

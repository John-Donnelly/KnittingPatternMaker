import type { RGB } from '../types.js';
import { labDistanceSq, rgbToLab, type Lab } from './lab.js';

/**
 * Index of the palette entry perceptually closest to `color` (CIE76 Lab distance).
 * Ties are broken by the lowest palette index, so the result is deterministic even
 * when two palette entries are equidistant.
 *
 * For mapping MANY colors against one fixed palette (quantize, dither), use
 * {@link makeNearestColorMapper} instead — this single-shot form recomputes every palette
 * entry's Lab value on each call.
 */
export function nearestColorIndex(color: RGB, palette: readonly RGB[]): number {
  if (palette.length === 0) {
    throw new Error('Cannot find nearest color in an empty palette');
  }
  return nearestIndexInLab(rgbToLab(color), palette.map(rgbToLab));
}

/**
 * Precomputes the palette's Lab values once and returns a mapper from color -> nearest index.
 * Use this in hot per-pixel loops: it turns the per-call O(palette) Lab conversions into a
 * one-time cost, then each lookup only converts the query color. The result is byte-identical
 * to calling {@link nearestColorIndex} per pixel (same distances, same lowest-index tie-break).
 */
export function makeNearestColorMapper(palette: readonly RGB[]): (color: RGB) => number {
  if (palette.length === 0) {
    throw new Error('Cannot find nearest color in an empty palette');
  }
  const paletteLab = palette.map(rgbToLab);
  return (color: RGB) => nearestIndexInLab(rgbToLab(color), paletteLab);
}

function nearestIndexInLab(target: Lab, paletteLab: readonly Lab[]): number {
  let bestIndex = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < paletteLab.length; i++) {
    const entry = paletteLab[i];
    if (!entry) continue;
    const distance = labDistanceSq(target, entry);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }
  return bestIndex;
}

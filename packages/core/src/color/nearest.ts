import type { RGB } from '../types.js';
import { labDistanceSq, rgbToLab } from './lab.js';

/**
 * Index of the palette entry perceptually closest to `color` (CIE76 Lab distance).
 * Ties are broken by the lowest palette index, so the result is deterministic even
 * when two palette entries are equidistant.
 */
export function nearestColorIndex(color: RGB, palette: readonly RGB[]): number {
  if (palette.length === 0) {
    throw new Error('Cannot find nearest color in an empty palette');
  }
  const target = rgbToLab(color);
  let bestIndex = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const entry = palette[i];
    if (!entry) continue;
    const distance = labDistanceSq(target, rgbToLab(entry));
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }
  return bestIndex;
}

import type { RGB } from '../types.js';

export interface Lab {
  l: number;
  a: number;
  b: number;
}

/** D65 reference white, 2-degree observer. */
const REF_X = 95.047;
const REF_Y = 100.0;
const REF_Z = 108.883;

function srgbChannelToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function labPivot(t: number): number {
  const delta = 6 / 29;
  return t > delta ** 3 ? Math.cbrt(t) : t / (3 * delta ** 2) + 4 / 29;
}

/** Converts sRGB (0-255 ints) to CIE L*a*b* (D65). Pure function, fully deterministic. */
export function rgbToLab({ r, g, b }: RGB): Lab {
  const rl = srgbChannelToLinear(r);
  const gl = srgbChannelToLinear(g);
  const bl = srgbChannelToLinear(b);

  const x = (rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375) * 100;
  const y = (rl * 0.2126729 + gl * 0.7151522 + bl * 0.072175) * 100;
  const z = (rl * 0.0193339 + gl * 0.119192 + bl * 0.9503041) * 100;

  const fx = labPivot(x / REF_X);
  const fy = labPivot(y / REF_Y);
  const fz = labPivot(z / REF_Z);

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

/** CIE76 Euclidean distance in Lab space. Deterministic, no perceptual weighting (documented simplification). */
export function labDistanceSq(a: Lab, b: Lab): number {
  const dl = a.l - b.l;
  const da = a.a - b.a;
  const db = a.b - b.b;
  return dl * dl + da * da + db * db;
}

/** Relative luminance (Rec. 709 coefficients on linear-light channels), used for stable palette ordering. */
export function relativeLuminance({ r, g, b }: RGB): number {
  return (
    0.2126 * srgbChannelToLinear(r) +
    0.7152 * srgbChannelToLinear(g) +
    0.0722 * srgbChannelToLinear(b)
  );
}

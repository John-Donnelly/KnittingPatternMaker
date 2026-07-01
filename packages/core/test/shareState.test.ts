import { describe, expect, it } from 'vitest';
import { zlibSync } from 'fflate';
import {
  decodePatternSpec,
  encodePatternSpec,
  type PatternSpec,
} from '../src/pattern/shareState.js';
import { encodeBase64Url } from '../src/pattern/base64url.js';
import { MAX_COLORS, MAX_GRID_DIMENSION, MAX_SHARE_LINK_LENGTH } from '../src/limits.js';
import type { Grid } from '../src/types.js';

function sampleSpec(): PatternSpec {
  const grid: Grid = {
    width: 5,
    height: 4,
    indices: Uint16Array.from([0, 1, 2, 1, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0]),
    palette: [
      { r: 10, g: 20, b: 30 },
      { r: 200, g: 100, b: 50 },
      { r: 250, g: 250, b: 250 },
    ],
  };
  return { technique: 'stranded', gauge: { stitchesPer4In: 22, rowsPer4In: 30 }, grid };
}

describe('encodePatternSpec / decodePatternSpec', () => {
  it('round-trips a pattern spec exactly, including gauge', () => {
    const spec = sampleSpec();
    const encoded = encodePatternSpec(spec);
    const decoded = decodePatternSpec(encoded);

    expect(decoded.technique).toBe(spec.technique);
    expect(decoded.gauge).toEqual(spec.gauge);
    expect(decoded.grid.width).toBe(spec.grid.width);
    expect(decoded.grid.height).toBe(spec.grid.height);
    expect(Array.from(decoded.grid.indices)).toEqual(Array.from(spec.grid.indices));
    expect(decoded.grid.palette).toEqual(spec.grid.palette);
  });

  it('round-trips a spec with no gauge (gauge omitted, not present as undefined key)', () => {
    const spec = sampleSpec();
    const { gauge: _gauge, ...withoutGauge } = spec;
    void _gauge;
    const encoded = encodePatternSpec(withoutGauge);
    const decoded = decodePatternSpec(encoded);
    expect(decoded.gauge).toBeUndefined();
  });

  it('produces a URL-safe string with no padding or reserved characters', () => {
    const encoded = encodePatternSpec(sampleSpec());
    expect(encoded).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it('is deterministic: the same spec always encodes to the same string', () => {
    const spec = sampleSpec();
    expect(encodePatternSpec(spec)).toBe(encodePatternSpec(spec));
  });

  it('throws a descriptive error for garbage input', () => {
    expect(() => decodePatternSpec('not-a-real-payload-!!!')).toThrow(/invalid|corrupt/i);
  });

  it('throws for truncated (tampered) valid-looking input', () => {
    const encoded = encodePatternSpec(sampleSpec());
    expect(() => decodePatternSpec(encoded.slice(0, encoded.length - 10))).toThrow();
  });

  it('rejects an unsupported version', () => {
    const payload = { v: 2, t: 'stranded', w: 1, h: 1, p: [[0, 0, 0]], i: [0] };
    const compressed = zlibSync(new TextEncoder().encode(JSON.stringify(payload)));
    const encoded = encodeBase64Url(compressed);
    expect(() => decodePatternSpec(encoded)).toThrow(/version/i);
  });

  it('rejects a payload whose index/grid size does not match', () => {
    const payload = { v: 1, t: 'stranded', w: 2, h: 2, p: [[0, 0, 0]], i: [0, 0] };
    const compressed = zlibSync(new TextEncoder().encode(JSON.stringify(payload)));
    const encoded = encodeBase64Url(compressed);
    expect(() => decodePatternSpec(encoded)).toThrow(/size mismatch/i);
  });

  it('rejects a palette index out of range', () => {
    const payload = { v: 1, t: 'stranded', w: 1, h: 1, p: [[0, 0, 0]], i: [5] };
    const compressed = zlibSync(new TextEncoder().encode(JSON.stringify(payload)));
    const encoded = encodeBase64Url(compressed);
    expect(() => decodePatternSpec(encoded)).toThrow(/out of palette range/i);
  });

  it('rejects an oversized encoded token before attempting to decode it', () => {
    const huge = 'A'.repeat(MAX_SHARE_LINK_LENGTH + 1);
    expect(() => decodePatternSpec(huge)).toThrow(/too long/i);
  });

  it('rejects grid dimensions beyond MAX_GRID_DIMENSION even if internally consistent', () => {
    const size = MAX_GRID_DIMENSION + 1;
    const payload = {
      v: 1,
      t: 'stranded',
      w: size,
      h: 1,
      p: [[0, 0, 0]],
      i: new Array(size).fill(0),
    };
    const compressed = zlibSync(new TextEncoder().encode(JSON.stringify(payload)));
    const encoded = encodeBase64Url(compressed);
    expect(() => decodePatternSpec(encoded)).toThrow(/invalid grid dimensions/i);
  });

  it('does not allocate unbounded memory for a decompression-bomb-style payload', () => {
    // A large, highly repetitive buffer compresses to a tiny token but would expand to tens of
    // megabytes if decompressed without a cap. Decoding it must fail cleanly, not hang or throw
    // an out-of-memory error.
    const bomb = new Uint8Array(50 * 1024 * 1024);
    const compressed = zlibSync(bomb, { level: 9 });
    const encoded = encodeBase64Url(compressed);
    expect(encoded.length).toBeLessThan(MAX_SHARE_LINK_LENGTH);
    expect(() => decodePatternSpec(encoded)).toThrow();
  });

  it('round-trips a pattern at the maximum grid dimension', () => {
    const size = MAX_GRID_DIMENSION;
    const grid: Grid = {
      width: size,
      height: 1,
      indices: Uint16Array.from(new Array(size).fill(0)),
      palette: [{ r: 1, g: 2, b: 3 }],
    };
    const encoded = encodePatternSpec({ technique: 'texture', grid });
    expect(encoded.length).toBeLessThan(MAX_SHARE_LINK_LENGTH);
    const decoded = decodePatternSpec(encoded);
    expect(decoded.grid.width).toBe(size);
  });

  it('rejects a zero or negative gauge value (would divide-by-zero / invert downstream math)', () => {
    for (const badGauge of [
      { s: 0, r: 30 },
      { s: -5, r: 30 },
      { s: 20, r: 0 },
    ]) {
      const payload = { v: 1, t: 'stranded', w: 1, h: 1, p: [[0, 0, 0]], i: [0], g: badGauge };
      const compressed = zlibSync(new TextEncoder().encode(JSON.stringify(payload)));
      const encoded = encodeBase64Url(compressed);
      expect(() => decodePatternSpec(encoded)).toThrow(/gauge/i);
    }
  });

  it('rejects a gauge value beyond the 200 sts/rows-per-4in bound', () => {
    const payload = {
      v: 1,
      t: 'stranded',
      w: 1,
      h: 1,
      p: [[0, 0, 0]],
      i: [0],
      g: { s: 201, r: 30 },
    };
    const compressed = zlibSync(new TextEncoder().encode(JSON.stringify(payload)));
    const encoded = encodeBase64Url(compressed);
    expect(() => decodePatternSpec(encoded)).toThrow(/gauge/i);
  });

  it('rejects an out-of-range palette color channel', () => {
    const payload = { v: 1, t: 'stranded', w: 1, h: 1, p: [[300, 0, 0]], i: [0] };
    const compressed = zlibSync(new TextEncoder().encode(JSON.stringify(payload)));
    const encoded = encodeBase64Url(compressed);
    expect(() => decodePatternSpec(encoded)).toThrow(/palette color/i);
  });

  it('rejects a palette larger than MAX_COLORS', () => {
    const bigPalette = Array.from({ length: MAX_COLORS + 1 }, (_, i) => [i % 256, 0, 0]);
    const payload = { v: 1, t: 'stranded', w: 1, h: 1, p: bigPalette, i: [0] };
    const compressed = zlibSync(new TextEncoder().encode(JSON.stringify(payload)));
    const encoded = encodeBase64Url(compressed);
    expect(() => decodePatternSpec(encoded)).toThrow(/palette size/i);
  });
});

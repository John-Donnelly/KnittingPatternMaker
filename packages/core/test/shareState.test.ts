import { describe, expect, it } from 'vitest';
import { zlibSync } from 'fflate';
import {
  decodePatternSpec,
  encodePatternSpec,
  type PatternSpec,
} from '../src/pattern/shareState.js';
import { encodeBase64Url } from '../src/pattern/base64url.js';
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
});

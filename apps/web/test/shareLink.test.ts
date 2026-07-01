import { afterEach, describe, expect, it } from 'vitest';
import type { PatternSpec } from 'knitting-pattern-core';
import {
  buildShareUrl,
  clearPatternFromLocation,
  readPatternFromLocation,
} from '../src/shareLink.js';

function sampleSpec(): PatternSpec {
  return {
    technique: 'stranded',
    gauge: { stitchesPer4In: 22, rowsPer4In: 30 },
    grid: {
      width: 2,
      height: 2,
      indices: Uint16Array.from([0, 1, 1, 0]),
      palette: [
        { r: 0, g: 0, b: 0 },
        { r: 255, g: 255, b: 255 },
      ],
    },
  };
}

describe('shareLink', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('round-trips a pattern spec through the URL hash', () => {
    const spec = sampleSpec();
    const url = buildShareUrl(spec);
    window.history.replaceState(null, '', url);

    const decoded = readPatternFromLocation();
    expect(decoded?.technique).toBe('stranded');
    expect(decoded?.gauge).toEqual(spec.gauge);
    expect(Array.from(decoded?.grid.indices ?? [])).toEqual([0, 1, 1, 0]);
  });

  it('returns undefined when there is no pattern in the URL', () => {
    window.history.replaceState(null, '', '/');
    expect(readPatternFromLocation()).toBeUndefined();
  });

  it('returns undefined for a corrupt token instead of throwing', () => {
    window.history.replaceState(null, '', '/#p=not-a-real-token');
    expect(readPatternFromLocation()).toBeUndefined();
  });

  it('clearPatternFromLocation removes the hash', () => {
    const url = buildShareUrl(sampleSpec());
    window.history.replaceState(null, '', url);
    expect(window.location.hash).not.toBe('');
    clearPatternFromLocation();
    expect(window.location.hash).toBe('');
  });
});

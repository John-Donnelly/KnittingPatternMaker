import { describe, expect, it } from 'vitest';
import { runLengthEncode } from '../src/pattern/runLength.js';

describe('runLengthEncode', () => {
  it('encodes an empty array as no runs', () => {
    expect(runLengthEncode([])).toEqual([]);
  });

  it('encodes a single repeated value as one run', () => {
    expect(runLengthEncode([1, 1, 1])).toEqual([{ value: 1, count: 3 }]);
  });

  it('encodes alternating values as separate runs', () => {
    expect(runLengthEncode([1, 2, 1, 2])).toEqual([
      { value: 1, count: 1 },
      { value: 2, count: 1 },
      { value: 1, count: 1 },
      { value: 2, count: 1 },
    ]);
  });

  it('groups consecutive equal values, preserving order', () => {
    expect(runLengthEncode(['a', 'a', 'b', 'b', 'b', 'a'])).toEqual([
      { value: 'a', count: 2 },
      { value: 'b', count: 3 },
      { value: 'a', count: 1 },
    ]);
  });
});

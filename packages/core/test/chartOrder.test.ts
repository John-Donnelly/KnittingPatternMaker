import { describe, expect, it } from 'vitest';
import { chartRowToGridRow, isRightSideRow, toKnittingOrder } from '../src/pattern/chartOrder.js';

describe('chartRowToGridRow', () => {
  it('maps chart row 1 (first knit, bottom of picture) to the last grid row', () => {
    expect(chartRowToGridRow(1, 10)).toBe(9);
  });

  it('maps the last chart row (top of picture) to grid row 0', () => {
    expect(chartRowToGridRow(10, 10)).toBe(0);
  });
});

describe('isRightSideRow', () => {
  it('treats odd chart rows as RS', () => {
    expect(isRightSideRow(1)).toBe(true);
    expect(isRightSideRow(3)).toBe(true);
  });

  it('treats even chart rows as WS', () => {
    expect(isRightSideRow(2)).toBe(false);
    expect(isRightSideRow(4)).toBe(false);
  });
});

describe('toKnittingOrder', () => {
  const imageRow = ['a', 'b', 'c', 'd'];

  it('reverses image order for RS rows (right-to-left reading)', () => {
    expect(toKnittingOrder(imageRow, 1)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('preserves image order for WS rows (left-to-right reading)', () => {
    expect(toKnittingOrder(imageRow, 2)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('does not mutate the input array', () => {
    const copy = imageRow.slice();
    toKnittingOrder(imageRow, 1);
    expect(imageRow).toEqual(copy);
  });
});

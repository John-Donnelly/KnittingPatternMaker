import { describe, expect, it } from 'vitest';
import { applyColorEdits, despeckleGrid, isIdentityEdits } from '../src/pattern/colorEdits.js';
import type { Grid } from '../src/types.js';

const RED = { r: 200, g: 30, b: 30 };
const BLUE = { r: 30, g: 60, b: 200 };
const WHITE = { r: 245, g: 245, b: 245 };

function makeGrid(): Grid {
  return {
    width: 3,
    height: 2,
    indices: Uint16Array.from([0, 1, 2, 2, 1, 0]),
    palette: [RED, BLUE, WHITE],
  };
}

describe('applyColorEdits', () => {
  it('identity edits leave the grid unchanged', () => {
    const edits = [{ enabled: true }, { enabled: true }, { enabled: true }];
    expect(isIdentityEdits(edits)).toBe(true);
    const out = applyColorEdits(makeGrid(), edits);
    expect(out.palette).toEqual([RED, BLUE, WHITE]);
    expect(Array.from(out.indices)).toEqual([0, 1, 2, 2, 1, 0]);
  });

  it('substitutes a color everywhere', () => {
    const GREEN = { r: 30, g: 160, b: 60 };
    const out = applyColorEdits(makeGrid(), [
      { enabled: true, override: GREEN },
      { enabled: true },
      { enabled: true },
    ]);
    expect(out.palette[0]).toEqual(GREEN);
    expect(Array.from(out.indices)).toEqual([0, 1, 2, 2, 1, 0]);
  });

  it('turning a color off merges its stitches into the nearest enabled color', () => {
    // Disable BLUE; its stitches must land on the perceptually nearest of RED/WHITE.
    const out = applyColorEdits(makeGrid(), [
      { enabled: true },
      { enabled: false },
      { enabled: true },
    ]);
    expect(out.palette).toEqual([RED, WHITE]);
    // Every former-BLUE stitch now points at an existing palette entry.
    for (const idx of out.indices) expect(idx).toBeLessThan(2);
    // Positions 1 and 4 were BLUE; both must have the same replacement.
    expect(out.indices[1]).toBe(out.indices[4]);
  });

  it('nearest-match for a disabled color respects its override', () => {
    // BLUE disabled but overridden to near-white first: it should merge into WHITE.
    const out = applyColorEdits(makeGrid(), [
      { enabled: true },
      { enabled: false, override: { r: 240, g: 240, b: 240 } },
      { enabled: true },
    ]);
    expect(out.palette).toEqual([RED, WHITE]);
    expect(out.indices[1]).toBe(1); // WHITE's new index
  });

  it('disabling every color is treated as all-enabled', () => {
    const out = applyColorEdits(makeGrid(), [
      { enabled: false },
      { enabled: false },
      { enabled: false },
    ]);
    expect(out.palette).toHaveLength(3);
    expect(Array.from(out.indices)).toEqual([0, 1, 2, 2, 1, 0]);
  });

  it('is deterministic', () => {
    const edits = [{ enabled: false }, { enabled: true }, { enabled: true, override: RED }];
    const a = applyColorEdits(makeGrid(), edits);
    const b = applyColorEdits(makeGrid(), edits);
    expect(a.palette).toEqual(b.palette);
    expect(Array.from(a.indices)).toEqual(Array.from(b.indices));
  });
});

describe('despeckleGrid', () => {
  it('replaces isolated single stitches with the majority neighbor color', () => {
    // A lone RED cell in a WHITE field.
    const grid: Grid = {
      width: 3,
      height: 3,
      indices: Uint16Array.from([2, 2, 2, 2, 0, 2, 2, 2, 2]),
      palette: [RED, BLUE, WHITE],
    };
    const out = despeckleGrid(grid);
    expect(Array.from(out.indices)).toEqual([2, 2, 2, 2, 2, 2, 2, 2, 2]);
    expect(out.palette).toEqual(grid.palette); // palette (and indices meaning) untouched
  });

  it('keeps 2-stitch runs and never touches 1-row charts (too few neighbors to judge)', () => {
    const run: Grid = {
      width: 4,
      height: 2,
      indices: Uint16Array.from([2, 0, 0, 2, 2, 2, 2, 2]),
      palette: [RED, BLUE, WHITE],
    };
    expect(Array.from(despeckleGrid(run).indices)).toEqual([2, 0, 0, 2, 2, 2, 2, 2]);

    const strip: Grid = {
      width: 4,
      height: 1,
      indices: Uint16Array.from([2, 0, 1, 2]),
      palette: [RED, BLUE, WHITE],
    };
    expect(Array.from(despeckleGrid(strip).indices)).toEqual([2, 0, 1, 2]);
  });

  it('adjacent isolated cells both resolve from the ORIGINAL state (simultaneous pass)', () => {
    // R and B sit side by side, each isolated; each sees the OTHER as it was, and both
    // resolve to the surrounding white in one pass.
    const rows = [
      [2, 2, 2, 2],
      [2, 0, 1, 2],
      [2, 2, 2, 2],
    ];
    const grid: Grid = {
      width: 4,
      height: 3,
      indices: Uint16Array.from(rows.flat()),
      palette: [RED, BLUE, WHITE],
    };
    const out = despeckleGrid(grid);
    expect(Array.from(out.indices)).toEqual([2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]);
    expect(Array.from(despeckleGrid(grid).indices)).toEqual(Array.from(out.indices));
  });
});

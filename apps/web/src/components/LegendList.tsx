import {
  paletteLabel,
  type ColorEdit,
  type GridJson,
  type YardageEstimate,
} from 'knitting-pattern-core';

interface Props {
  /** The (possibly edited) grid being displayed — stats come from here. */
  grid: GridJson;
  yardage: YardageEstimate;
  /** Per-ORIGINAL-palette-index edit controls; omit for a read-only legend (shared view). */
  editable?:
    | {
        /** The original (pre-edit) palette the edit controls index into. */
        originalPalette: GridJson['palette'];
        edits: ColorEdit[];
        onChange: (edits: ColorEdit[]) => void;
      }
    | undefined;
}

function toHex(n: number): string {
  return n.toString(16).padStart(2, '0');
}

function hexOf(c: { r: number; g: number; b: number }): string {
  return `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`;
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

export function LegendList({ grid, yardage, editable }: Props) {
  const setEdit = (index: number, patch: Partial<ColorEdit>) => {
    if (!editable) return;
    editable.onChange(editable.edits.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  };
  const dirty = editable?.edits.some((e) => !e.enabled || e.override) ?? false;

  // In the editable view, rows follow the ORIGINAL palette; a surviving color's position in
  // the edited grid is the number of enabled entries before it (applyColorEdits keeps order).
  const rows = editable
    ? editable.originalPalette.map((original, i) => {
        const edit = editable.edits[i] ?? { enabled: true };
        const editedIndex = editable.edits.slice(0, i).filter((e) => e.enabled).length;
        return {
          i,
          edit,
          color: edit.override ?? original,
          est: edit.enabled
            ? yardage.perColor.find((c) => c.paletteIndex === editedIndex)
            : undefined,
        };
      })
    : grid.palette.map((color, i) => ({
        i,
        edit: undefined,
        color,
        est: yardage.perColor.find((c) => c.paletteIndex === i),
      }));

  return (
    <div className="panel">
      <h3>Color legend</h3>
      <p className="hint">
        Yardage is a rough estimate from gauge and stitch count — buy an extra margin per color.
        {editable &&
          ' Untick a color to merge it into its nearest neighbor, or pick a new shade to substitute it everywhere.'}
      </p>
      <ul className="legend">
        {rows.map(({ i, edit, color, est }) => (
          <li key={i} className={`legend__row${edit && !edit.enabled ? ' legend__row--off' : ''}`}>
            {edit ? (
              <>
                <input
                  type="checkbox"
                  checked={edit.enabled}
                  aria-label={`Use color ${paletteLabel(i)}`}
                  onChange={(e) => setEdit(i, { enabled: e.target.checked })}
                />
                <input
                  type="color"
                  className="legend__picker"
                  value={hexOf(color)}
                  aria-label={`Substitute color ${paletteLabel(i)}`}
                  onChange={(e) => setEdit(i, { override: parseHex(e.target.value) })}
                />
              </>
            ) : (
              <span
                className="legend__swatch"
                style={{ backgroundColor: `rgb(${color.r}, ${color.g}, ${color.b})` }}
              />
            )}
            <span className="legend__label">{paletteLabel(i)}</span>
            <span className="legend__hex">{hexOf(color)}</span>
            <span className="legend__stats">
              {edit && !edit.enabled
                ? 'off — merged into nearest'
                : `${est?.stitchCount ?? 0} sts · ~${(est?.estimatedYards ?? 0).toFixed(1)} yd`}
            </span>
          </li>
        ))}
      </ul>
      <p className="legend__total">
        Total estimated yardage: ~{yardage.totalEstimatedYards.toFixed(1)} yd
      </p>
      {editable && dirty && (
        <button
          type="button"
          className="button--quiet"
          onClick={() => editable.onChange(editable.originalPalette.map(() => ({ enabled: true })))}
        >
          Reset colors
        </button>
      )}
    </div>
  );
}

import {
  MAX_COLORS,
  MAX_GRID_DIMENSION,
  type DitherMode,
  type Technique,
} from 'knitting-pattern-core';

export interface FormState {
  technique: Technique;
  widthStitches: number;
  heightRows: number;
  useGauge: boolean;
  stitchesPer4In: number;
  rowsPer4In: number;
  maxColors: number;
  dither: DitherMode;
  cropMode: 'auto' | 'full';
  seamless: boolean;
}

interface Props {
  value: FormState;
  onChange: (next: FormState) => void;
}

const TECHNIQUE_OPTIONS: { value: Technique; label: string; hint: string }[] = [
  {
    value: 'stranded',
    label: 'Stranded (Fair Isle)',
    hint: 'Multiple colors per row carried as floats. Best with a small palette.',
  },
  {
    value: 'intarsia',
    label: 'Intarsia',
    hint: 'One bobbin per color block, no floats. Supports more detail/colors.',
  },
  {
    value: 'texture',
    label: 'Knit/purl texture',
    hint: 'Single color; tone shown as purl-bump relief. Always 2 tones.',
  },
];

export function ControlsPanel({ value, onChange }: Props) {
  const set = <K extends keyof FormState>(key: K, next: FormState[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <fieldset className="panel">
      <legend>Pattern settings</legend>

      <label className="field">
        <span>Technique</span>
        <select
          value={value.technique}
          aria-describedby="technique-hint"
          onChange={(e) => set('technique', e.target.value as Technique)}
        >
          {TECHNIQUE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <span id="technique-hint" className="field__hint">
        {TECHNIQUE_OPTIONS.find((o) => o.value === value.technique)?.hint}
      </span>

      <div className="field-row">
        <label className="field">
          <span>Width (stitches)</span>
          <input
            type="number"
            min={1}
            max={MAX_GRID_DIMENSION}
            value={value.widthStitches}
            onChange={(e) => set('widthStitches', clampInt(e.target.value, 1, MAX_GRID_DIMENSION))}
          />
        </label>
        <label className="field">
          <span>Height (rows)</span>
          <input
            type="number"
            min={1}
            max={MAX_GRID_DIMENSION}
            value={value.heightRows}
            onChange={(e) => set('heightRows', clampInt(e.target.value, 1, MAX_GRID_DIMENSION))}
          />
        </label>
      </div>

      <label className="field field--checkbox">
        <input
          type="checkbox"
          checked={value.useGauge}
          onChange={(e) => set('useGauge', e.target.checked)}
        />
        <span>Specify gauge (corrects stitch proportions &amp; estimates finished size)</span>
      </label>

      {value.useGauge && (
        <div className="field-row">
          <label className="field">
            <span>Stitches per 4in</span>
            <input
              type="number"
              min={1}
              max={200}
              value={value.stitchesPer4In}
              onChange={(e) => set('stitchesPer4In', clampInt(e.target.value, 1, 200))}
            />
          </label>
          <label className="field">
            <span>Rows per 4in</span>
            <input
              type="number"
              min={1}
              max={200}
              value={value.rowsPer4In}
              onChange={(e) => set('rowsPer4In', clampInt(e.target.value, 1, 200))}
            />
          </label>
        </div>
      )}

      {value.technique !== 'texture' && (
        <label className="field">
          <span>Max colors: {value.maxColors}</span>
          <input
            type="range"
            min={2}
            max={MAX_COLORS}
            value={value.maxColors}
            onChange={(e) => set('maxColors', Number(e.target.value))}
          />
        </label>
      )}

      <label className="field">
        <span>Dithering</span>
        <select value={value.dither} onChange={(e) => set('dither', e.target.value as DitherMode)}>
          <option value="none">None (flat color regions — recommended for colorwork)</option>
          <option value="bayer4">Ordered (Bayer)</option>
          <option value="floyd-steinberg">Floyd–Steinberg</option>
        </select>
      </label>

      <label className="field">
        <span>Crop</span>
        <select
          value={value.cropMode}
          onChange={(e) => set('cropMode', e.target.value as 'auto' | 'full')}
        >
          <option value="auto">Auto-crop to match gauge proportions (recommended)</option>
          <option value="full">Use full image (may stretch)</option>
        </select>
      </label>

      <label className="field field--checkbox">
        <input
          type="checkbox"
          checked={value.seamless}
          onChange={(e) => set('seamless', e.target.checked)}
        />
        <span>Seamless tiling (repeat the pattern left-right and top-bottom with no seam)</span>
      </label>
    </fieldset>
  );
}

function clampInt(raw: string, min: number, max: number): number {
  const n = Math.round(Number(raw));
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

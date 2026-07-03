import {
  MAX_COLORS,
  MAX_GRID_DIMENSION,
  type AutoDecision,
  type DitherMode,
  type SamplingMode,
  type SeamlessMode,
  type Technique,
} from 'knitting-pattern-core';

export interface FormState {
  /** 'auto' sends no settings — the backend picks everything from the image and reports why. */
  mode: 'auto' | 'custom';
  technique: Technique;
  widthStitches: number;
  heightRows: number;
  useGauge: boolean;
  stitchesPer4In: number;
  rowsPer4In: number;
  maxColors: number;
  dither: DitherMode;
  sampling: SamplingMode;
  cropMode: 'auto' | 'full';
  seamless: SeamlessMode;
  repeatAcross: number;
  repeatDown: number;
}

interface Props {
  value: FormState;
  onChange: (next: FormState) => void;
  /** Auto mode's choices for the current pattern (shown with reasons while mode is 'auto'). */
  autoDecisions?: AutoDecision[] | null | undefined;
  /** Switches to custom mode seeded with auto's resolved settings. */
  onCustomize?: (() => void) | undefined;
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

export function ControlsPanel({ value, onChange, autoDecisions, onCustomize }: Props) {
  const set = <K extends keyof FormState>(key: K, next: FormState[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <fieldset className="panel">
      <legend>Pattern settings</legend>

      <label className="field">
        <span>Settings</span>
        <select
          value={value.mode}
          aria-describedby="mode-hint"
          onChange={(e) => set('mode', e.target.value as FormState['mode'])}
        >
          <option value="auto">Auto (recommended)</option>
          <option value="custom">Custom</option>
        </select>
      </label>
      <span id="mode-hint" className="field__hint">
        {value.mode === 'auto'
          ? 'Analyzes the image and picks the technique, size, colors, and sampling for you.'
          : 'Set every option yourself.'}
      </span>

      {value.mode === 'auto' && (
        <>
          {autoDecisions && autoDecisions.length > 0 && (
            <ul className="auto-decisions">
              {autoDecisions.map((d) => (
                <li key={d.field} className="auto-decisions__item">
                  <strong>
                    {d.field}: {d.value}
                  </strong>{' '}
                  — {d.reason}
                </li>
              ))}
            </ul>
          )}
          {onCustomize && (
            <button type="button" onClick={onCustomize}>
              Customize these settings
            </button>
          )}
        </>
      )}

      {value.mode === 'custom' && <CustomControls value={value} set={set} />}
    </fieldset>
  );
}

function CustomControls({
  value,
  set,
}: {
  value: FormState;
  set: <K extends keyof FormState>(key: K, next: FormState[K]) => void;
}) {
  return (
    <>
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
        <span>Sampling</span>
        <select
          value={value.sampling}
          aria-describedby="sampling-hint"
          onChange={(e) => set('sampling', e.target.value as SamplingMode)}
        >
          <option value="average">Average (smooth — best for photos)</option>
          <option value="dominant">
            Dominant color (crisp — best for charts / logos / pixel art)
          </option>
        </select>
      </label>
      <span id="sampling-hint" className="field__hint">
        {value.sampling === 'dominant'
          ? 'Picks each cell’s most common color and ignores grid lines / JPEG noise — recovers flat colors from a photo or JPEG of a chart.'
          : 'Averages each cell — natural for photos and gradients, but can muddy a scanned chart’s flat colors.'}
      </span>

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

      <fieldset className="subpanel">
        <legend>Repeat &amp; tiling</legend>

        <div className="field-row">
          <label className="field">
            <span>Repeat across</span>
            <input
              type="number"
              min={1}
              max={MAX_GRID_DIMENSION}
              value={value.repeatAcross}
              onChange={(e) => set('repeatAcross', clampInt(e.target.value, 1, MAX_GRID_DIMENSION))}
            />
          </label>
          <label className="field">
            <span>Repeat down</span>
            <input
              type="number"
              min={1}
              max={MAX_GRID_DIMENSION}
              value={value.repeatDown}
              onChange={(e) => set('repeatDown', clampInt(e.target.value, 1, MAX_GRID_DIMENSION))}
            />
          </label>
        </div>
        <span className="field__hint">
          Tiles the motif into the final chart — e.g. 3 × 1 lays the design down three times side by
          side. Final chart = motif size × these counts.
        </span>
        {(() => {
          const finalW = value.widthStitches * value.repeatAcross;
          const finalH = value.heightRows * value.repeatDown;
          const over = finalW > MAX_GRID_DIMENSION || finalH > MAX_GRID_DIMENSION;
          return (
            <span className={over ? 'error' : 'field__hint'}>
              Final chart: {finalW} × {finalH} stitches
              {over
                ? ` — over the ${MAX_GRID_DIMENSION} limit. Reduce the motif size or repeat counts.`
                : ''}
            </span>
          );
        })()}

        <label className="field">
          <span>Seamless join</span>
          <select
            value={value.seamless}
            aria-describedby="seamless-hint"
            onChange={(e) => set('seamless', e.target.value as SeamlessMode)}
          >
            <option value="none">None (repeats may show a seam at each join)</option>
            <option value="horizontal">Horizontal (blend left/right edges)</option>
            <option value="vertical">Vertical (blend top/bottom edges)</option>
            <option value="both">Both directions</option>
          </select>
        </label>
        <span id="seamless-hint" className="field__hint">
          Blends the motif&rsquo;s opposite edges so the repeat loops with no visible seam. Match
          this to the direction(s) you&rsquo;re repeating.
        </span>
      </fieldset>
    </>
  );
}

function clampInt(raw: string, min: number, max: number): number {
  const n = Math.round(Number(raw));
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

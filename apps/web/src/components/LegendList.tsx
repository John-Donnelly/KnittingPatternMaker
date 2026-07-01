import { paletteLabel, type GridJson, type YardageEstimate } from 'knitting-pattern-core';

interface Props {
  grid: GridJson;
  yardage: YardageEstimate;
}

function toHex(n: number): string {
  return n.toString(16).padStart(2, '0');
}

export function LegendList({ grid, yardage }: Props) {
  return (
    <div className="panel">
      <h3>Color legend</h3>
      <p className="hint">
        Yardage is a rough estimate from gauge and stitch count — buy an extra margin per color.
      </p>
      <ul className="legend">
        {grid.palette.map((color, i) => {
          const est = yardage.perColor.find((c) => c.paletteIndex === i);
          return (
            <li key={i} className="legend__row">
              <span
                className="legend__swatch"
                style={{ backgroundColor: `rgb(${color.r}, ${color.g}, ${color.b})` }}
              />
              <span className="legend__label">{paletteLabel(i)}</span>
              <span className="legend__hex">
                #{toHex(color.r)}
                {toHex(color.g)}
                {toHex(color.b)}
              </span>
              <span className="legend__stats">
                {est?.stitchCount ?? 0} sts · ~{(est?.estimatedYards ?? 0).toFixed(1)} yd
              </span>
            </li>
          );
        })}
      </ul>
      <p className="legend__total">
        Total estimated yardage: ~{yardage.totalEstimatedYards.toFixed(1)} yd
      </p>
    </div>
  );
}

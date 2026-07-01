import { paletteLabel, type PatternResultJson } from 'knitting-pattern-core';

interface Props {
  pattern: PatternResultJson;
}

export function WarningsPanel({ pattern }: Props) {
  if (pattern.technique === 'stranded') {
    const { floatWarnings, manyColorRowWarnings } = pattern;
    if (floatWarnings.length === 0 && manyColorRowWarnings.length === 0) return null;
    return (
      <div className="panel panel--warning">
        <h3>Notes</h3>
        {manyColorRowWarnings.length > 0 && (
          <>
            <p className="hint">
              Stranded (Fair Isle) colorwork is typically worked with at most 2 colors per row.
              Consider intarsia for these rows, or reduce the color count.
            </p>
            <ul>
              {manyColorRowWarnings.map((w) => (
                <li key={w.chartRow}>
                  Row {w.chartRow}: {w.colorCount} colors
                </li>
              ))}
            </ul>
          </>
        )}
        {floatWarnings.length > 0 && (
          <>
            <p className="hint">Long floats — catch every ~5 stitches:</p>
            <ul>
              {floatWarnings.map((w, i) => (
                <li key={i}>
                  Row {w.chartRow}: {paletteLabel(w.paletteIndex)} floats {w.length} stitches
                  (between stitch {w.fromStitch} and {w.toStitch})
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    );
  }

  if (pattern.technique === 'intarsia') {
    return (
      <div className="panel">
        <h3>Bobbins needed: {pattern.bobbinCount}</h3>
        <p className="hint">
          Each contiguous color region needs its own bobbin. Twist yarns at every color change
          (bring the new color up and over the old) to avoid holes.
        </p>
      </div>
    );
  }

  return (
    <div className="panel">
      <h3>Stitch key</h3>
      <p className="hint">
        K = knit, P = purl. P stitches show as a raised bump on the right side; K stitches show as a
        flat &quot;V&quot;. The stitch to work is already inverted for WS rows above so the picture
        reads correctly from the right side.
      </p>
    </div>
  );
}

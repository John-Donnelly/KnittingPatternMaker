import type { PatternResultJson } from 'knitting-pattern-core';

interface Props {
  pattern: PatternResultJson;
}

export function InstructionsList({ pattern }: Props) {
  return (
    <div className="panel">
      <h3>Row-by-row instructions</h3>
      <details className="conventions">
        <summary>How to read this pattern</summary>
        <ul>
          <li>Worked flat in stockinette, bottom-up: row 1 is the bottom of the chart.</li>
          <li>
            Odd rows are the right side (RS) — knit, reading the chart right-to-left. Even rows are
            the wrong side (WS) — purl, reading left-to-right.
          </li>
          <li>C1, C2, … are the yarn colors from the legend above.</li>
          {pattern.technique === 'texture' && (
            <li>
              K = knit, P = purl. The stitch letters are already flipped on WS rows so the picture
              comes out right on the RS — just work each row as written.
            </li>
          )}
          {pattern.technique === 'stranded' && (
            <li>Carry the unused color loosely behind the work; catch floats every ~5 stitches.</li>
          )}
          {pattern.technique === 'intarsia' && (
            <li>Use one bobbin per color block and twist the yarns at every color change.</li>
          )}
          <li>Working in the round instead? Read every round right-to-left and knit all rounds.</li>
        </ul>
      </details>
      <ol className="instructions">
        {pattern.rows.map((row) => (
          <li key={row.chartRow}>{row.text}</li>
        ))}
      </ol>
    </div>
  );
}

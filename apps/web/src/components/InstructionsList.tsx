import type { PatternResultJson } from 'knitting-pattern-core';

interface Props {
  pattern: PatternResultJson;
}

export function InstructionsList({ pattern }: Props) {
  return (
    <div className="panel">
      <h3>Row-by-row instructions</h3>
      <p className="hint">
        Worked flat, bottom-up. Odd rows are RS (read right-to-left); even rows are WS (read
        left-to-right). See docs/KNITTING_NOTES.md for conventions.
      </p>
      <ol className="instructions">
        {pattern.rows.map((row) => (
          <li key={row.chartRow}>{row.text}</li>
        ))}
      </ol>
    </div>
  );
}

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { GridJson, YardageEstimate } from 'knitting-pattern-core';
import { LegendList } from '../src/components/LegendList.js';

describe('LegendList', () => {
  it('renders a swatch, label, hex code, and yardage per color', () => {
    const grid: GridJson = {
      width: 2,
      height: 1,
      indices: [0, 1],
      palette: [
        { r: 255, g: 0, b: 0 },
        { r: 0, g: 0, b: 255 },
      ],
    };
    const yardage: YardageEstimate = {
      perColor: [
        { paletteIndex: 0, stitchCount: 5, floatInches: 0, estimatedYards: 1.234 },
        { paletteIndex: 1, stitchCount: 7, floatInches: 0, estimatedYards: 2.345 },
      ],
      totalEstimatedYards: 3.579,
    };

    render(<LegendList grid={grid} yardage={yardage} />);

    expect(screen.getByText('C1')).toBeInTheDocument();
    expect(screen.getByText('#ff0000')).toBeInTheDocument();
    expect(screen.getByText('C2')).toBeInTheDocument();
    expect(screen.getByText('#0000ff')).toBeInTheDocument();
    expect(screen.getByText(/5 sts.*~1\.2 yd/)).toBeInTheDocument();
    expect(screen.getByText(/Total estimated yardage: ~3\.6 yd/)).toBeInTheDocument();
  });
});

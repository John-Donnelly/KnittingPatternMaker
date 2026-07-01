import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { PatternResultJson } from 'knitting-pattern-core';
import { WarningsPanel } from '../src/components/WarningsPanel.js';

describe('WarningsPanel', () => {
  it('renders nothing for stranded patterns with no warnings', () => {
    const pattern: PatternResultJson = {
      technique: 'stranded',
      rows: [],
      floatWarnings: [],
      manyColorRowWarnings: [],
      totalFloatStitchesByColor: [],
    };
    const { container } = render(<WarningsPanel pattern={pattern} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists float and many-color warnings for stranded patterns', () => {
    const pattern: PatternResultJson = {
      technique: 'stranded',
      rows: [],
      floatWarnings: [{ chartRow: 3, paletteIndex: 1, length: 8, fromStitch: 2, toStitch: 11 }],
      manyColorRowWarnings: [{ chartRow: 5, colorCount: 3 }],
      totalFloatStitchesByColor: [[1, 8]],
    };
    render(<WarningsPanel pattern={pattern} />);
    expect(screen.getByText(/Row 3: C2 floats 8 stitches/)).toBeInTheDocument();
    expect(screen.getByText(/Row 5: 3 colors/)).toBeInTheDocument();
  });

  it('shows the bobbin count for intarsia', () => {
    const pattern: PatternResultJson = {
      technique: 'intarsia',
      rows: [],
      blocks: [],
      bobbinCount: 4,
    };
    render(<WarningsPanel pattern={pattern} />);
    expect(screen.getByText(/Bobbins needed: 4/)).toBeInTheDocument();
  });

  it('shows the K/P key for texture', () => {
    const pattern: PatternResultJson = { technique: 'texture', rows: [] };
    render(<WarningsPanel pattern={pattern} />);
    expect(screen.getByText(/Stitch key/)).toBeInTheDocument();
    expect(screen.getByText(/K = knit, P = purl/)).toBeInTheDocument();
  });
});

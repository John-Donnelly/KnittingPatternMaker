import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LegendList } from '../src/components/LegendList.js';
import type { GridJson } from 'knitting-pattern-core';
import type { YardageEstimate } from 'knitting-pattern-core';

const GRID: GridJson = {
  width: 2,
  height: 1,
  indices: [0, 1],
  palette: [
    { r: 200, g: 30, b: 30 },
    { r: 245, g: 245, b: 245 },
  ],
};
const YARDAGE: YardageEstimate = {
  perColor: [
    { paletteIndex: 0, stitchCount: 1, floatInches: 0, estimatedYards: 0.1 },
    { paletteIndex: 1, stitchCount: 1, floatInches: 0, estimatedYards: 0.1 },
  ],
  totalEstimatedYards: 0.2,
};

describe('LegendList color edits', () => {
  it('reports a color being turned off', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <LegendList
        grid={GRID}
        yardage={YARDAGE}
        editable={{
          originalPalette: GRID.palette,
          edits: [{ enabled: true }, { enabled: true }],
          onChange,
        }}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: /use color c1/i }));
    expect(onChange).toHaveBeenCalledWith([{ enabled: false }, { enabled: true }]);
  });

  it('shows the off state and a reset button when dirty', () => {
    const onChange = vi.fn();
    render(
      <LegendList
        grid={GRID}
        yardage={YARDAGE}
        editable={{
          originalPalette: GRID.palette,
          edits: [{ enabled: false }, { enabled: true }],
          onChange,
        }}
      />,
    );
    expect(screen.getByText(/off — merged into nearest/i)).toBeInTheDocument();
    screen.getByRole('button', { name: /reset colors/i }).click();
    expect(onChange).toHaveBeenCalledWith([{ enabled: true }, { enabled: true }]);
  });

  it('reports a substitution from the color picker', () => {
    const onChange = vi.fn();
    render(
      <LegendList
        grid={GRID}
        yardage={YARDAGE}
        editable={{
          originalPalette: GRID.palette,
          edits: [{ enabled: true }, { enabled: true }],
          onChange,
        }}
      />,
    );
    const picker = screen.getByLabelText(/substitute color c1/i);
    fireEvent.change(picker, { target: { value: '#1e7828' } });
    expect(onChange).toHaveBeenCalledWith([
      { enabled: true, override: { r: 30, g: 120, b: 40 } },
      { enabled: true },
    ]);
  });

  it('renders read-only without controls when not editable', () => {
    render(<LegendList grid={GRID} yardage={YARDAGE} />);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});

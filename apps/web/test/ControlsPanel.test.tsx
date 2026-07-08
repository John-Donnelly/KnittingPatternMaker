import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MAX_GRID_DIMENSION } from 'knitting-pattern-core';
import { ControlsPanel, type FormState } from '../src/components/ControlsPanel.js';

function baseForm(overrides: Partial<FormState> = {}): FormState {
  return {
    mode: 'custom',
    technique: 'stranded',
    widthStitches: 40,
    heightRows: 40,
    useGauge: true,
    stitchesPer4In: 22,
    rowsPer4In: 30,
    maxColors: 8,
    shadeMergeDeltaE: 10,
    dither: 'none',
    sampling: 'average',
    cropMode: 'auto',
    seamless: 'none',
    repeatAcross: 1,
    repeatDown: 1,
    ...overrides,
  };
}

describe('ControlsPanel', () => {
  it('defaults to hiding all manual fields in auto mode', () => {
    render(<ControlsPanel value={baseForm({ mode: 'auto' })} onChange={() => {}} />);
    expect(screen.queryByLabelText('Technique')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Width (stitches)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Sampling')).not.toBeInTheDocument();
  });

  it('shows auto decisions with reasons and a customize button in auto mode', async () => {
    const user = userEvent.setup();
    const onCustomize = vi.fn();
    render(
      <ControlsPanel
        value={baseForm({ mode: 'auto' })}
        onChange={() => {}}
        autoDecisions={[
          {
            field: 'technique',
            value: 'stranded',
            reason: 'Almost every row uses at most 2 colors.',
          },
        ]}
        onCustomize={onCustomize}
      />,
    );
    expect(screen.getByText(/technique: stranded/i)).toBeInTheDocument();
    expect(screen.getByText(/at most 2 colors/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /customize these settings/i }));
    expect(onCustomize).toHaveBeenCalled();
  });

  it('switches between auto and custom via the settings select', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlsPanel value={baseForm({ mode: 'auto' })} onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText('Settings'), 'custom');

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ mode: 'custom' }));
  });

  it('hides the max-colors slider for the texture technique', () => {
    render(<ControlsPanel value={baseForm({ technique: 'texture' })} onChange={() => {}} />);
    expect(screen.queryByText(/Max colors/)).not.toBeInTheDocument();
  });

  it('shows the max-colors slider for stranded/intarsia', () => {
    render(<ControlsPanel value={baseForm({ technique: 'stranded' })} onChange={() => {}} />);
    expect(screen.getByText(/Max colors: 8/)).toBeInTheDocument();
  });

  it('hides gauge fields until "specify gauge" is checked', () => {
    render(<ControlsPanel value={baseForm({ useGauge: false })} onChange={() => {}} />);
    expect(screen.queryByText('Stitches per 4in')).not.toBeInTheDocument();
  });

  it('calls onChange with the new technique when the select changes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlsPanel value={baseForm()} onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText('Technique'), 'intarsia');

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ technique: 'intarsia' }));
  });

  it('clamps width/height input to the valid range', () => {
    const onChange = vi.fn();
    render(<ControlsPanel value={baseForm()} onChange={onChange} />);

    // A single deterministic change past the limit clamps to MAX_GRID_DIMENSION.
    fireEvent.change(screen.getByLabelText('Width (stitches)'), { target: { value: '99999' } });

    const lastCall = onChange.mock.calls.at(-1)?.[0] as FormState;
    expect(lastCall.widthStitches).toBe(MAX_GRID_DIMENSION);
  });

  it('changes the seamless join direction via the select', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlsPanel value={baseForm({ seamless: 'none' })} onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText('Seamless join'), 'horizontal');

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ seamless: 'horizontal' }));
  });

  it('updates the repeat-across count', () => {
    const onChange = vi.fn();
    render(<ControlsPanel value={baseForm({ repeatAcross: 1 })} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Repeat across'), { target: { value: '3' } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ repeatAcross: 3 }));
  });

  it('shows the shade-grouping slider with an off state at 0', () => {
    render(<ControlsPanel value={baseForm({ shadeMergeDeltaE: 0 })} onChange={() => {}} />);
    expect(screen.getByText(/shade grouping: off/i)).toBeInTheDocument();
  });

  it('updates the shade-grouping threshold via the slider', () => {
    const onChange = vi.fn();
    render(<ControlsPanel value={baseForm()} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/shade grouping/i), { target: { value: '18' } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ shadeMergeDeltaE: 18 }));
  });

  it('changes the sampling mode via the select', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlsPanel value={baseForm({ sampling: 'average' })} onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText('Sampling'), 'dominant');

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sampling: 'dominant' }));
  });
});

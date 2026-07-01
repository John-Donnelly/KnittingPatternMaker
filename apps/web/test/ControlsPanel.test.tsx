import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ControlsPanel, type FormState } from '../src/components/ControlsPanel.js';

function baseForm(overrides: Partial<FormState> = {}): FormState {
  return {
    technique: 'stranded',
    widthStitches: 40,
    heightRows: 40,
    useGauge: true,
    stitchesPer4In: 22,
    rowsPer4In: 30,
    maxColors: 8,
    dither: 'none',
    sampling: 'average',
    cropMode: 'auto',
    seamless: false,
    ...overrides,
  };
}

describe('ControlsPanel', () => {
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

  it('clamps width/height input to the valid range', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlsPanel value={baseForm()} onChange={onChange} />);

    const widthInput = screen.getByLabelText('Width (stitches)');
    await user.clear(widthInput);
    await user.type(widthInput, '99999');

    const lastCall = onChange.mock.calls.at(-1)?.[0] as FormState;
    expect(lastCall.widthStitches).toBe(400);
  });

  it('toggles the seamless tiling checkbox', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlsPanel value={baseForm({ seamless: false })} onChange={onChange} />);

    await user.click(screen.getByLabelText(/Seamless tiling/));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ seamless: true }));
  });

  it('changes the sampling mode via the select', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlsPanel value={baseForm({ sampling: 'average' })} onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText('Sampling'), 'dominant');

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sampling: 'dominant' }));
  });
});

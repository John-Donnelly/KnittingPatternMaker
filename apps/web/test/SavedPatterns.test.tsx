import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MyPatterns, SavePatternForm } from '../src/components/SavedPatterns.js';

describe('SavePatternForm', () => {
  it('saves with the entered name and reports success', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => Response.json({ id: 7 }, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();

    render(<SavePatternForm spec="TOKEN" defaultName="stranded 40×40" onSaved={onSaved} />);
    const input = screen.getByLabelText('Pattern name');
    await user.clear(input);
    await user.type(input, 'Winter forest');
    await user.click(screen.getByRole('button', { name: /save pattern/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/patterns',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Winter forest', spec: 'TOKEN' }),
      }),
    );
    expect(await screen.findByText(/saved to your patterns/i)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});

describe('MyPatterns', () => {
  it('lists saved patterns and opens one by its spec token', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url === '/api/patterns') {
          return Response.json({
            patterns: [
              { id: 1, name: 'Forest', technique: 'intarsia', width: 38, height: 50, createdAt: 1 },
            ],
          });
        }
        if (url === '/api/patterns/1') {
          return Response.json({
            id: 1,
            name: 'Forest',
            technique: 'intarsia',
            width: 38,
            height: 50,
            createdAt: 1,
            spec: 'SPEC-TOKEN',
          });
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );
    const onOpen = vi.fn();

    render(<MyPatterns refreshKey={0} onOpen={onOpen} />);
    expect(await screen.findByText('Forest')).toBeInTheDocument();
    expect(screen.getByText(/intarsia · 38×50/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /open/i }));
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith('SPEC-TOKEN'));
    vi.unstubAllGlobals();
  });

  it('shows the empty state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ patterns: [] })),
    );
    render(<MyPatterns refreshKey={0} onOpen={() => {}} />);
    expect(await screen.findByText(/nothing saved yet/i)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});

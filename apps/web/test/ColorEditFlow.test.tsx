import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App.js';

/** Full-flow check: generate a pattern (stubbed backend), toggle a color in the legend, and
 * the instructions + chart data must re-derive immediately (client-side, no new request). */

const PATTERN_RESPONSE = {
  grid: {
    width: 2,
    height: 2,
    indices: [0, 1, 0, 1],
    palette: [
      { r: 20, g: 20, b: 20 },
      { r: 245, g: 245, b: 245 },
    ],
  },
  crop: { x: 0, y: 0, width: 20, height: 20 },
  sourceImage: { width: 20, height: 20 },
  pattern: {
    technique: 'intarsia',
    rows: [
      { chartRow: 1, side: 'RS', runs: [], text: 'Row 1 (RS): K1 C2, K1 C1' },
      { chartRow: 2, side: 'WS', runs: [], text: 'Row 2 (WS): P1 C2, P1 C1' },
    ],
    blocks: [],
    bobbinCount: 4,
  },
  yardage: {
    perColor: [
      { paletteIndex: 0, stitchCount: 2, floatInches: 0, estimatedYards: 0.2 },
      { paletteIndex: 1, stitchCount: 2, floatInches: 0, estimatedYards: 0.2 },
    ],
    totalEstimatedYards: 0.4,
  },
  shareLink: 'TOKEN',
  seamless: 'none',
  repeat: { across: 1, down: 1 },
  motif: { widthStitches: 2, heightRows: 2 },
  resolvedOptions: {
    technique: 'intarsia',
    widthStitches: 2,
    heightRows: 2,
    maxColors: 2,
    dither: 'none',
    sampling: 'dominant',
    seamless: 'none',
    repeat: { across: 1, down: 1 },
    shadeMergeDeltaE: 10,
  },
  autoDecisions: [],
};

beforeEach(() => {
  window.history.replaceState(null, '', '/app');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url === '/api/auth/me') {
        return Response.json({ authEnabled: false, authRequired: false, authenticated: false });
      }
      if (url.startsWith('/samples/')) {
        return new Response(new Blob(['x'], { type: 'image/png' }));
      }
      if (url === '/api/pattern') {
        return Response.json(PATTERN_RESPONSE);
      }
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
  vi.stubGlobal('createImageBitmap', async () => ({ width: 20, height: 20, close() {} }));
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:img'),
    revokeObjectURL: vi.fn(),
  });
});

describe('color edit + despeckle flow', () => {
  it('toggling a color off instantly re-derives instructions client-side', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Load a sample to drive the pipeline.
    await user.click(await screen.findByRole('button', { name: /heart sample motif/i }));
    expect(await screen.findByText('Row 1 (RS): K1 C2, K1 C1')).toBeInTheDocument();

    const fetchCalls = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.length;
    await user.click(screen.getByRole('checkbox', { name: /use color c1/i }));

    // Dark color disabled: its stitches merge into white -> single-color rows.
    expect(await screen.findByText('Row 1 (RS): K2 C1')).toBeInTheDocument();
    expect(await screen.findByText('Row 2 (WS): P2 C1')).toBeInTheDocument();
    // No new backend request — the re-derivation is client-side.
    expect((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.length).toBe(
      fetchCalls,
    );
  });

  it('the despeckle toggle re-derives the pattern too', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /heart sample motif/i }));
    await screen.findByText('Row 1 (RS): K1 C2, K1 C1');

    // 2x2 checkerboard has no >=3-neighbor cells, so despeckle is a no-op — but the toggle
    // must exist and the pattern must still render after flipping it.
    await user.click(screen.getByRole('checkbox', { name: /remove single stitches/i }));
    expect(await screen.findByText('Row 1 (RS): K1 C2, K1 C1')).toBeInTheDocument();
  });
});

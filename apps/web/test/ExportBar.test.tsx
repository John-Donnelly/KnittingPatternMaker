import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExportBar } from '../src/components/ExportBar.js';
import type { PatternSpecBody } from '../src/api/types.js';
import { blobResponse } from './blob-response.js';

const SPEC: PatternSpecBody = {
  technique: 'stranded',
  grid: {
    width: 2,
    height: 1,
    indices: [0, 1],
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 255, b: 255 },
    ],
  },
};

describe('ExportBar', () => {
  it('sends the pattern name with the export request', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () =>
      blobResponse(new Blob(['%PDF-'], { type: 'application/pdf' })),
    );
    vi.stubGlobal('fetch', fetchMock);
    // downloadBlob uses URL.createObjectURL + anchor click; stub the URL part in jsdom.
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:x'),
      revokeObjectURL: vi.fn(),
    });

    render(<ExportBar spec={SPEC} shareUrl="https://x/#p=T" defaultTitle="" />);
    await user.type(screen.getByLabelText(/pattern name/i), 'Winter Forest');
    await user.click(screen.getByRole('button', { name: /download pdf/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/export/pdf');
    expect(JSON.parse(String(init.body)).title).toBe('Winter Forest');
    vi.unstubAllGlobals();
  });
});

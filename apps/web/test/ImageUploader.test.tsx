import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImageUploader } from '../src/components/ImageUploader.js';
import { blobResponse } from './blob-response.js';

describe('ImageUploader', () => {
  it('shows a visible rejection message for non-image files', () => {
    const onImageSelected = vi.fn();
    render(<ImageUploader onImageSelected={onImageSelected} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['not an image'], 'notes.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText(/doesn't look like an image/i)).toBeInTheDocument();
    expect(onImageSelected).not.toHaveBeenCalled();
  });

  it('loads a sample via keyboard without hijacking into the file picker', async () => {
    const user = userEvent.setup();
    const onImageSelected = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => blobResponse(new Blob(['png-bytes'], { type: 'image/png' }))),
    );
    render(<ImageUploader onImageSelected={onImageSelected} />);

    const sample = screen.getByRole('button', { name: /heart sample motif/i });
    sample.focus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(onImageSelected).toHaveBeenCalled());
    const file = onImageSelected.mock.calls[0]?.[0] as File;
    expect(file.name).toBe('heart.png');
    vi.unstubAllGlobals();
  });

  it('reports a failed sample fetch honestly (not as an unsupported format)', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('missing', { status: 404 })),
    );
    render(<ImageUploader onImageSelected={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /fox sample motif/i }));

    expect(await screen.findByText(/could not load the sample image/i)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});

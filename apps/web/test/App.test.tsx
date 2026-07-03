import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App.js';

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  // Auth status probe: report SSO configured but signed out (not required).
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({ authEnabled: true, authRequired: false, authenticated: false }),
    ),
  );
});

describe('App', () => {
  it('renders the heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /knitting pattern maker/i })).toBeInTheDocument();
  });

  it('shows the landing page at / with a call to action', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { name: /turn any image into a knitting pattern/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /make a pattern/i })).toBeInTheDocument();
  });

  it('navigates from the landing page to the pattern maker', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /make a pattern/i }));

    expect(window.location.pathname).toBe('/app');
    // The maker view shows the image uploader instead of the hero.
    expect(screen.queryByRole('button', { name: /make a pattern/i })).not.toBeInTheDocument();
  });

  it('shows a sign-in link when SSO is enabled and the user is signed out', async () => {
    render(<App />);
    expect(await screen.findByRole('link', { name: /sign in/i })).toHaveAttribute(
      'href',
      '/api/auth/login',
    );
  });
});

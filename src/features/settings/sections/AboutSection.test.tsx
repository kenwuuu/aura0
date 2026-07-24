import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { AboutSection } from './AboutSection';

/**
 * The version label is assembled from two build-time constants: the commit SHA
 * (import.meta.env.VITE_APP_VERSION, unset under test → the "dev" branch) and
 * __BUILD_DATE__ (frozen in by Vite's `define`, so it IS present under vitest,
 * which shares the same config). We assert the shape, not a fixed string — the
 * date moves every build.
 */
describe('AboutSection version', () => {
  function versionText(): string {
    const row = screen.getByText('Version').closest('div')!.parentElement!;
    return within(row).getByText(/dev|\d{4}-\d{2}-\d{2}/).textContent ?? '';
  }

  it('shows a YYYY-MM-DD build date', () => {
    render(<AboutSection />);
    expect(versionText()).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('labels a build with no commit SHA as dev, never a bare date', () => {
    // Under test VITE_APP_VERSION is unset, so this exercises the dev branch —
    // the guard that a local build can't masquerade as a real release.
    render(<AboutSection />);
    expect(versionText()).toMatch(/^dev/);
  });
});

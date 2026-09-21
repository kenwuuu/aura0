import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FoilOverlay } from './FoilOverlay';
import { FOIL_STYLE_NEBULA } from './cosmeticsStore';

describe('FoilOverlay', () => {
  it('renders the treatment for a known style', () => {
    render(<FoilOverlay styleId={FOIL_STYLE_NEBULA} />);

    expect(screen.getByTestId('foil-overlay')).toHaveAttribute(
      'data-foil-style',
      FOIL_STYLE_NEBULA,
    );
  });

  it('renders nothing for an unknown style', () => {
    // A style id we don't recognize must not fall back to a look the player
    // never unlocked — and a future second style reaching an older bundle is
    // exactly how that would happen.
    render(<FoilOverlay styleId="not-a-real-style" />);

    expect(screen.queryByTestId('foil-overlay')).not.toBeInTheDocument();
  });

  it('is hidden from assistive technology', () => {
    // Pure decoration: it carries no information a screen reader should announce.
    render(<FoilOverlay styleId={FOIL_STYLE_NEBULA} />);

    expect(screen.getByTestId('foil-overlay')).toHaveAttribute('aria-hidden', 'true');
  });
});

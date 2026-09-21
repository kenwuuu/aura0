import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CosmeticsSection } from './CosmeticsSection';
import { FOIL_STYLE_NEBULA, useCosmeticsStore } from '@/features/cosmetics';

/** Real codes, minted by `scripts/foil-code.mjs`. Nothing here is mocked. */
const VALID_CODE = 'FOIL-9YEVN-Y6A';
/** Correctly shaped, one character off in the check digits — i.e. a typo. */
const MISTYPED_CODE = 'FOIL-9YEVN-Y6B';

describe('CosmeticsSection', () => {
  beforeEach(() => {
    useCosmeticsStore.setState({ entitlements: {} });
  });

  it('cannot submit an empty code', () => {
    render(<CosmeticsSection />);

    expect(screen.getByRole('button', { name: 'Redeem' })).toBeDisabled();
  });

  it('confirms the unlock after a good code', async () => {
    const user = userEvent.setup();
    render(<CosmeticsSection />);

    await user.type(screen.getByLabelText('Foil license code'), VALID_CODE);
    await user.click(screen.getByRole('button', { name: 'Redeem' }));

    expect(await screen.findByText('✓ Active')).toBeInTheDocument();
  });

  it('points a mistyped code back at the email it came from', async () => {
    // The only failure the player can hit now that the check is local, so the
    // copy has to be actionable on its own rather than one of two branches.
    const user = userEvent.setup();
    render(<CosmeticsSection />);

    await user.type(screen.getByLabelText('Foil license code'), MISTYPED_CODE);
    await user.click(screen.getByRole('button', { name: 'Redeem' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/check it against the email/i);
  });

  it('accepts a code the way an email delivers it', async () => {
    // Buyers paste, and a paste brings case and padding with it. Being strict
    // here would read to them as the code itself being wrong.
    const user = userEvent.setup();
    render(<CosmeticsSection />);

    await user.type(screen.getByLabelText('Foil license code'), `  ${VALID_CODE.toLowerCase()}  `);
    await user.click(screen.getByRole('button', { name: 'Redeem' }));

    expect(await screen.findByText('✓ Active')).toBeInTheDocument();
  });

  it('clears the failure as soon as the player edits the code', async () => {
    // An error left standing over a code the player has already started fixing
    // reads as though the new one failed too.
    const user = userEvent.setup();
    render(<CosmeticsSection />);

    const input = screen.getByLabelText('Foil license code');
    await user.type(input, MISTYPED_CODE);
    await user.click(screen.getByRole('button', { name: 'Redeem' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await user.type(input, 'X');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('stops offering the purchase once it is unlocked', async () => {
    // Nobody should be able to buy the same cosmetic twice, and the code box
    // has nothing left to do.
    render(<CosmeticsSection />);
    expect(screen.getByRole('button', { name: 'Open Ko-fi' })).toBeInTheDocument();

    act(() => {
      useCosmeticsStore.setState({ entitlements: { [FOIL_STYLE_NEBULA]: true } });
    });

    expect(screen.queryByRole('button', { name: 'Open Ko-fi' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Foil license code')).not.toBeInTheDocument();
  });

  it('warns that fulfillment is not instant', () => {
    // The 24-hour gap between paying and receiving a code is the single most
    // likely thing to read as a broken purchase, so it is stated up front.
    render(<CosmeticsSection />);

    expect(screen.getByText(/within 24 hours/i)).toBeInTheDocument();
  });
});

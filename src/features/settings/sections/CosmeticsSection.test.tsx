import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CosmeticsSection } from './CosmeticsSection';
import { FOIL_STYLE_NEBULA, useCosmeticsStore } from '@/features/cosmetics';

const respondWith = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue({ status, json: async () => body } as Response);

describe('CosmeticsSection', () => {
  beforeEach(() => {
    useCosmeticsStore.setState({ entitlements: {} });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('cannot submit an empty code', () => {
    render(<CosmeticsSection />);

    expect(screen.getByRole('button', { name: 'Redeem' })).toBeDisabled();
  });

  it('confirms the unlock after a good code', async () => {
    vi.stubGlobal('fetch', respondWith(200, { valid: true, style: FOIL_STYLE_NEBULA }));
    const user = userEvent.setup();
    render(<CosmeticsSection />);

    await user.type(screen.getByLabelText('Foil license code'), 'FOIL-7X2QF');
    await user.click(screen.getByRole('button', { name: 'Redeem' }));

    expect(await screen.findByText('✓ Active')).toBeInTheDocument();
  });

  it('tells a bad code apart from an unreachable server', async () => {
    // These send the player somewhere different — one means "check what you
    // typed", the other "wait and retry" — so the copy must not be shared.
    vi.stubGlobal('fetch', respondWith(200, { valid: false }));
    const user = userEvent.setup();
    render(<CosmeticsSection />);

    await user.type(screen.getByLabelText('Foil license code'), 'FOIL-NOPE1');
    await user.click(screen.getByRole('button', { name: 'Redeem' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/check it against the email/i);
  });

  it('says to retry when the server could not be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const user = userEvent.setup();
    render(<CosmeticsSection />);

    await user.type(screen.getByLabelText('Foil license code'), 'FOIL-7X2QF');
    await user.click(screen.getByRole('button', { name: 'Redeem' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't reach the server/i);
  });

  it('clears the failure as soon as the player edits the code', async () => {
    // An error left standing over a code the player has already started fixing
    // reads as though the new one failed too.
    vi.stubGlobal('fetch', respondWith(200, { valid: false }));
    const user = userEvent.setup();
    render(<CosmeticsSection />);

    const input = screen.getByLabelText('Foil license code');
    await user.type(input, 'FOIL-NOPE1');
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

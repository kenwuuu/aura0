import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeckImportModal } from './DeckImportModal';

// No mocks: these tests exercise the Help-dialog behavior and rendering only —
// they never trigger an import, so the network importer / IndexedDB storage are
// never constructed. Per tests/testing-react.md, mock only the I/O a test actually
// exercises (and via the `@/` alias, never a relative path).

// Helpers that name what the user is looking at, so the intent survives refactors.
const importDialogHeading = () => screen.getByRole('heading', { name: 'Import Deck' });
const queryImportDialogHeading = () => screen.queryByRole('heading', { name: 'Import Deck' });
const helpDialog = () => screen.getByRole('dialog', { name: /deck import guide/i });
const queryHelpGuide = () => screen.queryByText('Deck Import Guide');

describe('DeckImportModal — Help dialog integration', () => {
  const onClose = vi.fn();
  const onDeckImported = vi.fn();

  const renderModal = () =>
    render(<DeckImportModal isOpen onClose={onClose} onDeckImported={onDeckImported} />);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render the modal when closed', () => {
    render(<DeckImportModal isOpen={false} onClose={onClose} onDeckImported={onDeckImported} />);
    expect(queryImportDialogHeading()).not.toBeInTheDocument();
  });

  it('renders the modal when open', () => {
    renderModal();
    expect(importDialogHeading()).toBeInTheDocument();
  });

  it('exposes a Help button', () => {
    renderModal();
    expect(screen.getByRole('button', { name: /help/i })).toBeInTheDocument();
  });

  it('opens the Help dialog when Help is clicked', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: /help/i }));

    expect(screen.getByText('Deck Import Guide')).toBeInTheDocument();
  });

  it('keeps the import modal open while the Help dialog is open', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: /help/i }));

    // Radix marks the backgrounded modal aria-hidden while a nested dialog is
    // open, so it drops out of the accessibility tree (role/name queries can't
    // see it). Its label-associated form field stays in the DOM regardless, so
    // it's the stable proof the import modal is still mounted and not dismissed.
    expect(screen.getByText('Deck Import Guide')).toBeInTheDocument();
    expect(screen.getByLabelText('Deck Name')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps the import modal open after closing Help via "Got it"', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: /help/i }));
    await user.click(within(helpDialog()).getByRole('button', { name: /got it/i }));

    await waitFor(() => expect(queryHelpGuide()).not.toBeInTheDocument());
    expect(importDialogHeading()).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps the import modal open after closing Help via the × button', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: /help/i }));
    await user.click(within(helpDialog()).getByRole('button', { name: '×' }));

    await waitFor(() => expect(queryHelpGuide()).not.toBeInTheDocument());
    expect(importDialogHeading()).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows the guide content in the Help dialog', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: /help/i }));
    const guide = within(helpDialog());

    expect(guide.getByText('Recommended Format')).toBeInTheDocument();
    expect(guide.getByText('Not Supported')).toBeInTheDocument();
    expect(guide.getByText('Supported Formats')).toBeInTheDocument();
    expect(guide.getByText(/MTGO preset/i)).toBeInTheDocument();
    // The unsupported-headers explanation, plus a string unique to the code sample.
    expect(guide.getByText(/section headers like SIDEBOARD or COMMANDER/i)).toBeInTheDocument();
    expect(guide.getByText(/Zuran Orb/)).toBeInTheDocument();
  });

  it('allows reopening the Help dialog after closing it', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: /help/i }));
    expect(screen.getByText('Deck Import Guide')).toBeInTheDocument();

    await user.click(within(helpDialog()).getByRole('button', { name: /got it/i }));
    await waitFor(() => expect(queryHelpGuide()).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /help/i }));
    expect(screen.getByText('Deck Import Guide')).toBeInTheDocument();
  });
});

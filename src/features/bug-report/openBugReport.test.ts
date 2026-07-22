import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Sentry from '@sentry/react';
import posthog from 'posthog-js';
import { toast } from 'sonner';
import { seedGame } from '@/test/seedGame';
import { makeCard } from '@/test/factories';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { useHotkeyStore } from '@/app/stores/hotkeyStore';
import { openBugReport } from './openBugReport';

vi.mock('posthog-js', () => ({ default: { capture: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@sentry/react', () => ({ getFeedback: vi.fn() }));

type FeedbackOptions = Parameters<
  NonNullable<ReturnType<typeof Sentry.getFeedback>>['createForm']
>[0];

/** Stands in for Sentry's shadow-DOM dialog so the form lifecycle is assertable. */
function makeFakeDialog() {
  return {
    appendToDom: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
    removeFromDom: vi.fn(),
    el: {},
  };
}

/** Installs a fake feedback integration and hands back the options it was built with. */
function installFeedback(dialog = makeFakeDialog()) {
  const captured: { options?: FeedbackOptions } = {};
  const createForm = vi.fn(async (options?: FeedbackOptions) => {
    captured.options = options;
    return dialog;
  });
  vi.mocked(Sentry.getFeedback).mockReturnValue({
    createForm,
  } as unknown as ReturnType<typeof Sentry.getFeedback>);
  return { dialog, createForm, captured };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('openBugReport', () => {
  it('opens the form with the game snapshot attached as tags', async () => {
    const game = seedGame({ hand: [makeCard()] });
    const store = useGameInstance.getState();
    store.setYDoc(game.yDoc);
    store.setPlayer(game.player);
    const { dialog, captured } = installFeedback();

    await openBugReport('pile-viewer');

    expect(dialog.appendToDom).toHaveBeenCalled();
    expect(dialog.open).toHaveBeenCalled();
    expect(captured.options?.tags).toMatchObject({ surface: 'pile-viewer', hand_count: 1 });
  });

  it('counts the report in PostHog when it opens and again when it sends', async () => {
    const { captured } = installFeedback();

    await openBugReport('toolbar');
    expect(posthog.capture).toHaveBeenCalledWith('bug_report_opened', expect.objectContaining({
      surface: 'toolbar',
    }));

    captured.options?.onSubmitSuccess?.(
      { name: '', email: '', message: 'it broke', attachments: undefined },
      'event-1',
    );
    expect(posthog.capture).toHaveBeenCalledWith('bug_report_submitted', expect.objectContaining({
      surface: 'toolbar',
    }));
  });

  /**
   * The failure mode this whole fallback exists for: an ad blocker eats Sentry
   * ingest. The player must be told, and pointed somewhere a human reads.
   */
  it('points the player at Discord when the send fails', async () => {
    const { captured } = installFeedback();
    await openBugReport('help');

    captured.options?.onSubmitError?.(new Error('Failed to fetch'));

    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("Couldn't send"),
      expect.objectContaining({ action: expect.objectContaining({ label: 'Open Discord' }) }),
    );
    expect(posthog.capture).toHaveBeenCalledWith(
      'bug_report_failed',
      expect.objectContaining({ surface: 'help', reason: 'Failed to fetch' }),
    );
  });

  it('falls back to Discord when Sentry never initialized at all', async () => {
    vi.mocked(Sentry.getFeedback).mockReturnValue(undefined);

    await openBugReport('toolbar');

    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('unavailable'),
      expect.objectContaining({ action: expect.objectContaining({ label: 'Open Discord' }) }),
    );
  });

  /**
   * `createForm()` appends a new node every call. Without teardown, a player who
   * opens the form twice leaves a stale dialog behind — and the stale one still
   * carries the *previous* game snapshot in its tags.
   */
  it('tears down the previous dialog before opening another', async () => {
    const first = makeFakeDialog();
    installFeedback(first);
    await openBugReport('toolbar');

    const second = makeFakeDialog();
    installFeedback(second);
    await openBugReport('help');

    expect(first.removeFromDom).toHaveBeenCalled();
    expect(second.removeFromDom).not.toHaveBeenCalled();
  });

  it('removes the dialog from the DOM when the player closes it', async () => {
    const { dialog, captured } = installFeedback();
    await openBugReport('toolbar');

    captured.options?.onFormClose?.();

    expect(dialog.removeFromDom).toHaveBeenCalled();
  });

  /**
   * The form lives in a shadow DOM, so keydown events reaching `document` are
   * retargeted to the host `<div>` and react-hotkeys-hook's "user is typing"
   * check fails open. Unguarded, typing a report drew cards and mangled the
   * text — "deck duplicated cards" arrived as "dek dpl".
   */
  it('takes the keyboard away from the game while the form is up', async () => {
    const { captured } = installFeedback();

    await openBugReport('toolbar');
    expect(useHotkeyStore.getState().isKeyboardCaptured).toBe(true);

    captured.options?.onFormClose?.();
    expect(useHotkeyStore.getState().isKeyboardCaptured).toBe(false);
  });

  it('gives the keyboard back after a successful submit', async () => {
    const { captured } = installFeedback();
    await openBugReport('help');

    captured.options?.onFormSubmitted?.();

    expect(useHotkeyStore.getState().isKeyboardCaptured).toBe(false);
  });

  /** Sentry's dialog ignores Escape; every other modal in this app honours it. */
  it('closes on Escape and stops the key reaching a dialog underneath', async () => {
    const { dialog } = installFeedback();
    await openBugReport('help');

    const underlyingDialog = vi.fn();
    document.addEventListener('keydown', underlyingDialog);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.removeEventListener('keydown', underlyingDialog);

    expect(dialog.removeFromDom).toHaveBeenCalled();
    expect(useHotkeyStore.getState().isKeyboardCaptured).toBe(false);
    expect(underlyingDialog).not.toHaveBeenCalled();
  });

  it('stops listening for Escape once the form is gone', async () => {
    const { dialog, captured } = installFeedback();
    await openBugReport('toolbar');
    captured.options?.onFormClose?.();
    dialog.removeFromDom.mockClear();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(dialog.removeFromDom).not.toHaveBeenCalled();
  });
});

/**
 * Filing a bug report as one complete action: snapshot the game, attach the
 * snapshot, count it, take the keyboard, open the form, and handle the send
 * failing.
 *
 * Callers pass only *where* they were. Deciding what a bug report means — what
 * context travels with it, what gets tracked, who owns the keyboard while it's
 * up, what happens when ingest is blocked — belongs here, not in the buttons.
 * That is what stops a fifth surface from shipping with no context, no
 * telemetry, or a form the game's hotkeys type over.
 */
import * as Sentry from '@sentry/react';
import { toast } from 'sonner';
import { DISCORD_URL } from '@/constants';
import { useHotkeyStore } from '@/app/stores/hotkeyStore';
import {
  trackBugReportOpened,
  trackBugReportSubmitted,
  trackBugReportFailed,
} from '@/infrastructure/analytics/PosthogFunctions';
import { collectBugReportContext, type BugReportSurface } from './bugReportContext';

interface OpenDialog {
  close: () => void;
  removeFromDom: () => void;
}

/**
 * The live dialog, if one is open. Sentry's `createForm()` appends a fresh node
 * to the shadow DOM every call, so without tearing the previous one down a
 * player who opens the form four times leaves four dialogs behind — and the
 * stale ones still carry the *old* game snapshot in their tags.
 */
let openDialog: OpenDialog | null = null;
let detachEscape: (() => void) | null = null;

function teardown(): void {
  detachEscape?.();
  detachEscape = null;

  openDialog?.close();
  openDialog?.removeFromDom();
  openDialog = null;

  useHotkeyStore.getState().setKeyboardCaptured(false);
}

/**
 * Sentry's dialog does not close on Escape, and every other modal in this app
 * does — so without this the form reads as frozen, and (because its shadow host
 * covers the page) the whole board looks frozen with it.
 *
 * Capture phase plus `stopPropagation` so a bug report opened from *inside* a
 * Radix dialog — Help, the pile viewer — closes only the report, not both.
 */
function attachEscapeToClose(): void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    event.preventDefault();
    teardown();
  };

  document.addEventListener('keydown', onKeyDown, true);
  detachEscape = () => document.removeEventListener('keydown', onKeyDown, true);
}

export async function openBugReport(surface: BugReportSurface): Promise<void> {
  const context = collectBugReportContext(surface);

  trackBugReportOpened(context);

  const feedback = Sentry.getFeedback();
  if (!feedback) {
    // Absent in unit tests, and whenever Sentry never initialized (ad blocker,
    // offline first paint). Send the player somewhere a human will read it
    // rather than opening a form whose submit could only fail.
    toast.error('Bug reporting is unavailable — please tell us on Discord.', {
      action: { label: 'Open Discord', onClick: () => window.open(DISCORD_URL, '_blank') },
    });
    return;
  }

  teardown();

  // The form renders into a shadow DOM, so keydown events arriving at
  // `document` are retargeted to the shadow *host* — a plain `<div>`.
  // react-hotkeys-hook's "don't fire while typing in a field" check sees a div
  // and fires anyway, so without this the game eats what the player types:
  // "deck duplicated cards" arrived as "dek dpl", having drawn cards on the way.
  useHotkeyStore.getState().setKeyboardCaptured(true);

  // Tags rather than `Sentry.setContext()`: setContext writes to the global
  // scope, so this snapshot would then ride along on every unrelated error for
  // the rest of the session and age into a lie. Dialog tags travel with this
  // one feedback event and nothing else.
  const form = await feedback.createForm({
    tags: { ...context },
    onFormClose: teardown,
    onSubmitSuccess: () => {
      trackBugReportSubmitted(context);
    },
    onFormSubmitted: teardown,
    onSubmitError: (error: Error) => {
      // The likeliest cause by far is an ad blocker eating the ingest request —
      // and the players most likely to hit a weird bug are over-represented
      // among ad-blocked ones. Never let the report die silently.
      trackBugReportFailed(context, error.message);
      toast.error("Couldn't send that report — please tell us on Discord.", {
        action: { label: 'Open Discord', onClick: () => window.open(DISCORD_URL, '_blank') },
      });
    },
  });

  openDialog = form;
  attachEscapeToClose();
  form.appendToDom();
  form.open();
}

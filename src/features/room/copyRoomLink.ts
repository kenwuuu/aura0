/**
 * Copy the current room's invite link, with every consequence that entails.
 *
 * A "complete semantic action": the copy plus the analytics capture, the
 * invite-conversion arming, and the onboarding-tour notification all live here,
 * so both the toolbar's copy button and the command palette's "Copy game link"
 * command get the full behavior for free and can never drift. Returns whether
 * the clipboard write succeeded, so the caller can render its own feedback.
 */
import posthog from 'posthog-js';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { useTourStore } from '@/features/onboarding';
import { noteRoomLinkCopied } from './inviteConversion';

/**
 * Copy `text`, falling back to the legacy path on insecure origins.
 *
 * `navigator.clipboard` is gated behind a secure context, so it is simply
 * *undefined* over plain http — which is exactly how the app gets opened on a
 * real phone during development (`vite --host`, then the machine's LAN IP). The
 * unguarded `navigator.clipboard.writeText(...)` threw a TypeError there and the
 * button did nothing at all. Production is HTTPS and always takes the first branch.
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Denied or unavailable — fall through rather than leaving a dead button.
    }
  }

  const scratch = document.createElement('textarea');
  scratch.value = text;
  scratch.setAttribute('readonly', '');
  scratch.style.position = 'fixed';
  scratch.style.top = '-9999px';
  document.body.appendChild(scratch);
  scratch.select();

  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  document.body.removeChild(scratch);
  return copied;
}

export async function copyRoomLink(): Promise<boolean> {
  const ok = await copyText(window.location.href);
  if (!ok) return false;

  const roomManager = useGameInstance.getState().roomManager;
  if (roomManager) {
    posthog.capture('room_link_copied', { room: roomManager.getRoomName() });
  }
  // Arms `invite_converted`: if somebody now turns up in this room, the invite
  // landed. That — not the copy — is the outcome worth optimising.
  noteRoomLinkCopied();
  // The tour's `invite` step is the one whose completion leaves no trace in
  // Yjs, so it has to be told. No-ops when no tour is running.
  useTourStore.getState().noteRoomLinkCopied();
  return true;
}

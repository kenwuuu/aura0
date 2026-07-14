import React, { useState } from 'react';
import posthog from 'posthog-js';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { useTourStore } from '@/features/onboarding';

const CopyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" style={{ verticalAlign: 'middle' }}>
    <path fill="currentColor" d="M9.116 17q-.691 0-1.153-.462T7.5 15.385V4.615q0-.69.463-1.153T9.116 3h7.769q.69 0 1.153.462t.462 1.153v10.77q0 .69-.462 1.152T16.884 17zm0-1h7.769q.23 0 .423-.192t.192-.423V4.615q0-.23-.192-.423T16.884 4H9.116q-.231 0-.424.192t-.192.423v10.77q0 .23.192.423t.423.192m-3 4q-.69 0-1.153-.462T4.5 18.385V6.615h1v11.77q0 .23.192.423t.423.192h8.77v1zM8.5 16V4z"/>
  </svg>
);

const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" style={{ verticalAlign: 'middle' }}>
    <path fill="currentColor" d="m10.562 15.908l6.396-6.396l-.708-.708l-5.688 5.688l-2.85-2.85l-.708.708zM12.003 21q-1.866 0-3.51-.708q-1.643-.709-2.859-1.924t-1.925-2.856T3 12.003t.709-3.51Q4.417 6.85 5.63 5.634t2.857-1.925T11.997 3t3.51.709q1.643.708 2.859 1.922t1.925 2.857t.709 3.509t-.708 3.51t-1.924 2.859t-2.856 1.925t-3.509.709M12 20q3.35 0 5.675-2.325T20 12t-2.325-5.675T12 4T6.325 6.325T4 12t2.325 5.675T12 20m0-8"/>
  </svg>
);

/**
 * Copy `text`, falling back to the legacy path on insecure origins.
 *
 * `navigator.clipboard` is gated behind a secure context, so it is simply
 * *undefined* over plain http — which is exactly how the app gets opened on a
 * real phone during development (`vite --host`, then the machine's LAN IP). The
 * unguarded `navigator.clipboard.writeText(...)` threw a TypeError there and the
 * button did nothing at all, which also left the tour's `invite` step with no way
 * to complete. Production is HTTPS and always takes the first branch.
 */
async function copyText(text: string): Promise<boolean> {
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

export const RoomLinkButton: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const roomManager = useGameInstance((s) => s.roomManager);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    void copyText(window.location.href).then((ok) => {
      if (!ok) return;
      if (roomManager) posthog.capture('room_link_copied', { room: roomManager.getRoomName() });
      // The tour's `invite` step is the one whose completion leaves no trace in
      // Yjs, so it has to be told. No-ops when no tour is running.
      useTourStore.getState().noteRoomLinkCopied();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      id="room-name"
      data-testid="room-link"
      onClick={handleClick}
      style={{ color: copied ? '#4ade80' : undefined }}
      aria-label={copied ? 'Copied room link to clipboard' : 'Copy room link to clipboard'}
    >
      {/* Text collapses below `sm` (see "Toolbar responsive collapse" in
          style.css); the icon plus aria-label above stay the affordance. */}
      <span className="toolbar-link-label">{copied ? 'COPIED! ' : 'COPY ROOM LINK '}</span>
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
};

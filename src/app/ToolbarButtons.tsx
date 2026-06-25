/**
 * Toolbar button components for Help, Hotkeys, and Discord.
 *
 * Previously defined as inline React components inside `AuraApp.setupHelpModal()`,
 * `setupHotkeyHintsModal()`, and `setupDiscordButton()` in `src/index.ts` (Phase 5).
 * Rendered via portals in `App.tsx` into the static toolbar mount points in index.html.
 */
import React, { useState } from 'react';
import { HelpModal } from '@/app/HelpModal';
import { HotkeysModal } from '@/features/hotkeys/HotkeysModal';

export const HelpButton: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button className="toolbar-button" onClick={() => setIsOpen(true)}>
        Help
      </button>
      <HelpModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
};

export const HotkeysButton: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button className="toolbar-button" onClick={() => setIsOpen(true)}>
        Hotkeys
      </button>
      <HotkeysModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
};

export const DiscordButton: React.FC = () => (
  <button
    className="toolbar-button discord"
    onClick={() => window.open('https://discord.gg/PgH2gVZYKq', '_blank')}
    aria-label="Join Discord Server"
  >
    <img src="/assets/Discord-Logo-White.svg" alt="Discord" style={{ height: '16px' }} />
  </button>
);

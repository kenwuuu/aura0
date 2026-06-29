/**
 * Gear button that opens the Settings modal.
 *
 * Rendered inside the react-flow canvas via <Panel position="top-right">
 * so it lives in the game/board domain (below the site toolbar).
 * Holds its own open state and renders the modal inline, matching the
 * HelpButton / HotkeysButton pattern.
 */
import React, { useState } from 'react';
import { Settings } from 'lucide-react';
import { SettingsModal } from './SettingsModal';

export function SettingsButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        title="Settings"
        aria-label="Open settings"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
          borderRadius: 8,
          border: '1px solid #4a4a4a',
          background: 'rgba(26, 26, 26, 0.85)',
          color: '#d1d5db',
          cursor: 'pointer',
          backdropFilter: 'blur(8px)',
          transition: 'background 0.15s, color 0.15s, border-color 0.15s',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = '#2d2d2d';
          (e.currentTarget as HTMLButtonElement).style.color = '#ffffff';
          (e.currentTarget as HTMLButtonElement).style.borderColor = '#6b7280';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(26, 26, 26, 0.85)';
          (e.currentTarget as HTMLButtonElement).style.color = '#d1d5db';
          (e.currentTarget as HTMLButtonElement).style.borderColor = '#4a4a4a';
        }}
      >
        <Settings size={16} aria-hidden="true" />
      </button>
      <SettingsModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}

/**
 * Gear button that opens the Settings modal.
 *
 * Rendered inside the react-flow canvas via <Panel position="top-right">
 * so it lives in the game/board domain (below the site toolbar). The modal
 * itself is mounted once at the app root and opened via settingsModalStore,
 * so other surfaces (e.g. the connection-status tooltip) can open it too.
 */
import React from 'react';
import { Settings } from 'lucide-react';
import { useSettingsModalStore } from '@/app/stores/settingsModalStore';

export function SettingsButton() {
  const open = useSettingsModalStore((s) => s.open);

  return (
    <button
      onClick={() => open()}
      title="Settings"
      aria-label="Open settings"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 34,
        height: 34,
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
  );
}

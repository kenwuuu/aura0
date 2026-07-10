/**
 * HudIconButton — the app's square 34×34 on-board icon button (dark
 * translucent surface + blur, like the settings gear). Shared by the
 * settings button and the phone HUD panel toggles so HUD chrome stays
 * visually uniform.
 */
import React, { type ReactNode } from 'react';

export function HudIconButton({
  icon,
  ariaLabel,
  onClick,
  title,
  ariaExpanded,
  testId,
}: {
  icon: ReactNode;
  ariaLabel: string;
  onClick: () => void;
  title?: string;
  /** For toggle buttons: whether the surface this button controls is open. */
  ariaExpanded?: boolean;
  testId?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title ?? ariaLabel}
      aria-label={ariaLabel}
      aria-expanded={ariaExpanded}
      data-testid={testId}
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
      {icon}
    </button>
  );
}

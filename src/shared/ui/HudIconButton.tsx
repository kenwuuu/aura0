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
        border: '1px solid var(--line-2)',
        background: 'rgba(13, 13, 20, 0.85)',
        color: 'var(--text-dim)',
        cursor: 'pointer',
        backdropFilter: 'blur(8px)',
        transition: 'background 0.15s, color 0.15s, border-color 0.15s',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(13, 13, 20, 0.95)';
        (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)';
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)';
        (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 12px var(--glow)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(13, 13, 20, 0.85)';
        (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-dim)';
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--line-2)';
        (e.currentTarget as HTMLButtonElement).style.boxShadow = '';
      }}
    >
      {icon}
    </button>
  );
}

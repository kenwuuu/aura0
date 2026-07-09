/**
 * Gear button that opens the Settings modal.
 *
 * Rendered inside the react-flow canvas via a <Panel> so it lives in the
 * game/board domain (below the site toolbar) — bottom-left on desktop,
 * top-right on phone (see BattlefieldCanvas). The modal itself is mounted
 * once at the app root and opened via settingsModalStore, so other surfaces
 * (e.g. the connection-status tooltip) can open it too.
 */
import React from 'react';
import { Settings } from 'lucide-react';
import { useSettingsModalStore } from '@/app/stores/settingsModalStore';
import { HudIconButton } from '@/shared/ui/HudIconButton';

export function SettingsButton() {
  const open = useSettingsModalStore((s) => s.open);

  return (
    <HudIconButton
      icon={<Settings size={16} aria-hidden="true" />}
      ariaLabel="Open settings"
      title="Settings"
      onClick={() => open()}
    />
  );
}

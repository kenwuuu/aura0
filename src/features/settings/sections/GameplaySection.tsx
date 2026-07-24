/**
 * Gameplay settings section — how the board behaves when you act on it.
 *
 * The distinction from Display is what the setting changes: Display changes
 * how things *look* (zoom), Gameplay changes what an interaction *does*.
 * Snap-to-grid and the delete confirmation both arrived under their own
 * headings inside Display ("Board", "Confirmations"), which is how you could
 * tell they were in the wrong section — neither dragging onto the grid nor
 * being asked before a destructive action is a rendering preference.
 */
import React from 'react';
import { Checkbox } from '@/shared/ui/checkbox';
import { useSettingsStore } from '@/app/stores/settingsStore';
import { SettingRow } from '../components/SettingRow';
import { SettingGroup } from '../components/SettingGroup';

export function GameplaySection() {
  const snapToGridEnabled = useSettingsStore((s) => s.snapToGridEnabled);
  const setSnapToGridEnabled = useSettingsStore((s) => s.setSnapToGridEnabled);
  const confirmCardDelete = useSettingsStore((s) => s.confirmCardDelete);
  const setConfirmCardDelete = useSettingsStore((s) => s.setConfirmCardDelete);

  return (
    <div>
      <SettingGroup title="Board">
        <SettingRow
          label="Always snap to grid"
          description="Cards and tokens snap to the grid while dragging. When off, hold Alt during a drag to snap instead."
        >
          <Checkbox
            aria-label="Always snap to grid"
            checked={snapToGridEnabled}
            onCheckedChange={(checked) => setSnapToGridEnabled(checked === true)}
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="Confirmations">
        <SettingRow
          label="Ask before deleting a card"
          description="Deleting removes a card from the battlefield without sending it to a pile, and can't be undone."
        >
          <Checkbox
            aria-label="Ask before deleting a card"
            checked={confirmCardDelete}
            onCheckedChange={(checked) => setConfirmCardDelete(checked === true)}
          />
        </SettingRow>
      </SettingGroup>
    </div>
  );
}

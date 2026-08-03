/**
 * Hotkeys settings — pick a preset, rebind individual actions, reset.
 *
 * Rows come from `getHotkeysGroupedByZone()`, the same grouping the Help
 * modal's Shortcuts tab and the ⌘K reference use, so the editor lists exactly
 * the actions that are reachable from the keyboard and in the order players
 * already read them.
 *
 * That grouping filters on the catalog's *default* keys, not the effective
 * ones — deliberately. A row must not disappear the moment someone clears its
 * binding, or there would be no way to give it one back.
 */
import React, { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { useSettingsStore } from '@/app/stores/settingsStore';
import { useConfirmStore } from '@/app/stores/confirmStore';
import { getHotkeysGroupedByZone, HOTKEYS } from '@/features/hotkeys/hotkeys';
import { useEffectiveBindings } from '@/features/hotkeys/useHotkeyBindings';
import { findConflicts, formatKeyBinding, getBinding } from '@/features/hotkeys/bindings';
import {
  HOTKEY_PRESETS,
  PRESET_DESCRIPTIONS,
  PRESET_LABELS,
  PRESET_ORDER,
  type HotkeyPresetId,
} from '@/features/hotkeys/presets';
import { SettingRow } from '../components/SettingRow';
import { SettingGroup } from '../components/SettingGroup';
import { HotkeyCaptureButton } from '../components/HotkeyCaptureButton';
import styles from './HotkeysSection.module.css';

/** Human label for an action id, for conflict messages. */
function describeAction(action: string): string {
  return HOTKEYS.find((h) => h.action === action)?.shortDescription ?? action;
}

export function HotkeysSection() {
  const preset = useSettingsStore((s) => s.hotkeyPreset);
  const overrides = useSettingsStore((s) => s.hotkeyOverrides);
  const bindings = useEffectiveBindings();

  // Which row is armed, by action id. One at a time — two rows both swallowing
  // keystrokes would make the first capture ambiguous.
  const [recording, setRecording] = useState<string | null>(null);
  // Last conflict seen, so the warning survives the capture ending.
  const [conflict, setConflict] = useState<
    { action: string; binding: string; others: string[] } | null
  >(null);

  const zones = getHotkeysGroupedByZone();

  const applyPreset = (next: HotkeyPresetId) => {
    setConflict(null);
    useSettingsStore.getState().setHotkeyPreset(next);
  };

  const capture = (action: string, binding: string) => {
    const others = findConflicts(bindings, action, binding);
    setConflict(others.length > 0 ? { action, binding, others } : null);
    useSettingsStore.getState().setHotkeyBinding(action, [binding]);
  };

  // Clear the *other* holders of a key, leaving the new binding in place. This
  // is offered rather than done automatically: two actions sharing a key is
  // legal when their hover targets are disjoint (delete/tokenDelete have shared
  // Backspace forever), so the app can't know which case this is.
  const resolveConflict = () => {
    if (!conflict) return;
    const store = useSettingsStore.getState();
    for (const other of conflict.others) store.setHotkeyBinding(other, []);
    setConflict(null);
  };

  const confirmResetAll = () => {
    useConfirmStore.getState().open({
      title: 'Reset all hotkeys?',
      description: `Every key goes back to the ${PRESET_LABELS[preset]} preset. Any keys you've changed yourself will be lost.`,
      confirmLabel: 'Reset',
      destructive: true,
      onConfirm: () => {
        setConflict(null);
        useSettingsStore.getState().resetAllHotkeys();
      },
    });
  };

  const overrideCount = Object.keys(overrides).length;

  return (
    <div>
      <SettingGroup title="Preset">
        <SettingRow
          label="Keyboard scheme"
          description="Pick a starting point. You can still change any individual key below."
        >
          <Select value={preset} onValueChange={(v) => applyPreset(v as HotkeyPresetId)}>
            <SelectTrigger aria-label="Keyboard scheme" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRESET_ORDER.map((id) => (
                <SelectItem key={id} value={id}>
                  {PRESET_LABELS[id]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>

        <p className={styles.hint}>
          {PRESET_DESCRIPTIONS[preset]}
          {Object.keys(HOTKEY_PRESETS[preset]).length === 0 && ' These are the keys Aura originally shipped.'}
        </p>

        {overrideCount > 0 && (
          <div className={styles.actions}>
            <span className={styles.overrideCount}>
              {overrideCount === 1 ? '1 key changed' : `${overrideCount} keys changed`} from{' '}
              {PRESET_LABELS[preset]}
            </span>
            <Button size="sm" variant="outline" onClick={confirmResetAll} data-testid="reset-all-hotkeys">
              <RotateCcw aria-hidden="true" />
              Reset all
            </Button>
          </div>
        )}
      </SettingGroup>

      {conflict && (
        <div className={styles.conflict} role="alert" data-testid="hotkey-conflict">
          <span>
            <strong>{formatKeyBinding([conflict.binding])}</strong> is also bound to{' '}
            {conflict.others.map(describeAction).join(', ')}.
          </span>
          <Button size="sm" variant="secondary" onClick={resolveConflict}>
            Unbind {conflict.others.length === 1 ? 'it' : 'them'}
          </Button>
        </div>
      )}

      {zones.map((zone) => (
        <SettingGroup key={zone.zone} title={zone.zone}>
          {zone.hotkeys.map((hotkey) => {
            const keys = getBinding(bindings, hotkey.action);
            const isOverridden = hotkey.action in overrides;
            return (
              <SettingRow
                key={hotkey.action}
                label={hotkey.shortDescription}
                description={hotkey.longDescription}
              >
                <HotkeyCaptureButton
                  actionLabel={hotkey.shortDescription}
                  keys={keys}
                  isRecording={recording === hotkey.action}
                  onStartRecording={() => setRecording(hotkey.action)}
                  onStopRecording={() => setRecording(null)}
                  onCapture={(binding) => capture(hotkey.action, binding)}
                />
                {/* Only offered once a row actually differs from the preset —
                    a reset button that resets to what you already have reads as
                    broken. */}
                {isOverridden && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Reset ${hotkey.shortDescription} to the ${PRESET_LABELS[preset]} default`}
                    data-testid={`reset-hotkey-${hotkey.action}`}
                    onClick={() => {
                      setConflict(null);
                      useSettingsStore.getState().resetHotkeyBinding(hotkey.action);
                    }}
                  >
                    <RotateCcw aria-hidden="true" />
                  </Button>
                )}
              </SettingRow>
            );
          })}
        </SettingGroup>
      ))}
    </div>
  );
}

/**
 * Profile settings section — the player's identity as other people see it.
 *
 * Both fields write straight through `Player`, which syncs them to peers via
 * Yjs (name additionally persists to localStorage so it follows the user
 * across rooms). Neither existed as a settings surface before: the name was
 * only editable by clicking your own health node, and `Player.setColor` had no
 * caller at all — every player was stuck with the hash of their playerId.
 *
 * Local `useState` mirrors rather than subscribes: this is the surface doing
 * the writing, and Player exposes plain getters, not a reactive store. The
 * name commits on blur/Enter (like EditableName on the health node) so we
 * aren't writing to Yjs on every keystroke.
 */
import React, { useState } from 'react';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { playerColorToHex } from '@/features/player/playerColor';
import { Input } from '@/shared/ui/input';
import { SettingRow } from '../components/SettingRow';
import { SettingGroup } from '../components/SettingGroup';
import styles from './ProfileSection.module.css';

export function ProfileSection() {
  const player = useGameInstance((s) => s.player);

  const [name, setName] = useState(() => player?.getName() ?? '');
  const [color, setColor] = useState(() => playerColorToHex(player?.getColor() ?? '#888888'));

  // Bootstrap always sets `player` before React mounts, so this is a
  // type-narrowing guard rather than a state the user can actually see.
  if (!player) return null;

  const commitName = () => {
    player.setName(name);
    // setName falls back to the default when given blank input — reflect
    // whatever it actually stored rather than leaving the box empty.
    setName(player.getName());
  };

  return (
    <div>
      <SettingGroup title="Identity">
        <SettingRow
          label="Display name"
          description="What other players see on your health node and cursor."
        >
          <Input
            aria-label="Display name"
            className={styles.nameInput}
            value={name}
            maxLength={24}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
          />
        </SettingRow>

        <SettingRow
          label="Player color"
          description="Tints your cursor and health node for everyone in the game."
        >
          <input
            type="color"
            aria-label="Player color"
            className={styles.colorInput}
            value={color}
            onChange={(e) => {
              setColor(e.target.value);
              player.setColor(e.target.value);
            }}
          />
        </SettingRow>
      </SettingGroup>
    </div>
  );
}

import React, { useState } from 'react';
import { CustomCounter } from '@/features/player/types';
import { Stat } from './Stat';
import { PlayerCounters } from './PlayerCounters';
import { EditableHealth } from './EditableHealth';
import { EditableName } from './EditableName';
import styles from './HealthDisplay.module.css';

interface HealthDisplayProps {
  label: string;
  health: number;
  onModifyHealth: (delta: number) => void;
  variant?: 'local' | 'opponent';
  playerId?: string;
  /** When provided (local player only), the name label becomes editable. */
  onRename?: (name: string) => void;
  customCounters?: CustomCounter[];
  onAddCounter?: (title: string, icon: string) => void;
  onModifyCounter?: (counterId: string, delta: number) => void;
  onRemoveCounter?: (counterId: string) => void;
}

/**
 * Per-player widget: the health readout plus any custom counters. Health and
 * counters are both {@link Stat}s; the only difference is orientation and that
 * counters can be added/removed. The counter strip is revealed on hover.
 */
export const HealthDisplay: React.FC<HealthDisplayProps> = ({
  label,
  health,
  onModifyHealth,
  variant = 'local',
  playerId,
  onRename,
  customCounters = [],
  onAddCounter,
  onModifyCounter,
  onRemoveCounter,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const isOpponent = variant === 'opponent';

  return (
    <div
      className={`${styles.healthContainer} ${isOpponent ? styles.opponent : ''}`}
      data-player-id={playerId}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Stat
        orientation="vertical"
        name="health"
        label={onRename ? <EditableName name={label} onRename={onRename} /> : label}
        value={<EditableHealth health={health} onModifyHealth={onModifyHealth} />}
        onModify={onModifyHealth}
      />

      <PlayerCounters
        counters={customCounters}
        onAdd={onAddCounter}
        onModify={(id, delta) => onModifyCounter?.(id, delta)}
        onRemove={(id) => onRemoveCounter?.(id)}
        visible={isHovered}
      />
    </div>
  );
};

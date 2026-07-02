import React, { useState } from 'react';
import { CustomCounter } from '@/features/player/types';
import { PlayerCounterModal } from './PlayerCounterModal';
import styles from './HealthDisplay.module.css';
import { EditableHealth } from './EditableHealth';
import { EditableName } from './EditableName';

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
  const [showModal, setShowModal] = useState(false);

  const isOpponent = variant === 'opponent';

  return (
    <>
      <div
        className={`${styles.healthContainer} ${isOpponent ? styles.opponent : ''}`}
        data-player-id={playerId}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className={styles.health}>
          {onRename ? (
            <EditableName name={label} onRename={onRename} className={styles.healthLabel} />
          ) : (
            <div className={styles.healthLabel}>{label}</div>
          )}
          <EditableHealth health={health} onModifyHealth={onModifyHealth} className={styles.healthValue} />
          <div className={styles.healthControls}>
            <button onClick={() => onModifyHealth(-1)}>-</button>
            <button onClick={() => onModifyHealth(1)}>+</button>
          </div>
        </div>

        {isHovered && (
          <div className={styles.expandedContent}>
            {customCounters.map((counter) => (
              <div key={counter.id} className={styles.customCounter}>
                <span className={styles.counterIcon}>{counter.icon}</span>
                <div className={styles.counterInfo}>
                  <div className={styles.counterTitle}>{counter.title}</div>
                  <div className={styles.counterValue}>{counter.value}</div>
                </div>
                <div className={styles.counterControls}>
                  <button onClick={() => onModifyCounter?.(counter.id, -1)}>-</button>
                  <button onClick={() => onModifyCounter?.(counter.id, 1)}>+</button>
                </div>
                <button
                  className={styles.deleteButton}
                  onClick={() => onRemoveCounter?.(counter.id)}
                  title="Remove counter"
                >
                  ×
                </button>
              </div>
            ))}
            {onAddCounter && (
              <button
                className={styles.addCounterButton}
                onClick={() => setShowModal(true)}
                title="Add custom counter"
              >
                +
              </button>
            )}
          </div>
        )}
      </div>

      <PlayerCounterModal
        isOpen={showModal}
        onAdd={(title, icon) => { onAddCounter?.(title, icon); setShowModal(false); }}
        onCancel={() => setShowModal(false)}
      />
    </>
  );
};

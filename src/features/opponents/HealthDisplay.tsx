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
  exileCount?: number;
  discardCount?: number;
  handCount?: number;
  allowViewHand?: boolean;
  onViewExile?: () => void;
  onViewDiscard?: () => void;
  onViewHand?: () => void;
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
  exileCount = 0,
  discardCount = 0,
  handCount = 0,
  allowViewHand = false,
  onViewExile,
  onViewDiscard,
  onViewHand,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const isOpponent = variant === 'opponent';
  const expandClass = isOpponent ? styles.expandLeft : styles.expandRight;

  React.useEffect(() => {
    window.dispatchEvent(new CustomEvent(showModal ? 'modalOpen' : 'modalClosed'));
  }, [showModal]);

  const handleMouseLeave = () => {
    setIsHovered(false);
    if (isOpponent && playerId) {
      window.dispatchEvent(new CustomEvent('opponentBoardHover', { detail: { playerId, isHovered: false } }));
    }
  };

  const handleClick = () => {
    if (isOpponent && playerId) {
      window.dispatchEvent(new CustomEvent('opponentBoardPin', { detail: { playerId } }));
    }
  };

  return (
    <>
      <div
        className={`${styles.healthContainer} ${isOpponent ? styles.opponent : ''} ${expandClass}`}
        data-player-id={playerId}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
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

        {isOpponent && isHovered && (
          <>
            <div
              className="resource-pile hand-pile"
              onClick={allowViewHand ? onViewHand : undefined}
              style={{ cursor: allowViewHand ? 'pointer' : 'default', opacity: allowViewHand ? 1 : 0.7 }}
            >
              <div className="pile-label">Hand</div>
              <div className="pile-count">{handCount}</div>
            </div>
            <div className="resource-pile exile-pile" onClick={onViewExile}>
              <div className="pile-label">Exile</div>
              <div className="pile-count">{exileCount}</div>
            </div>
            <div className="resource-pile discard-pile" onClick={onViewDiscard}>
              <div className="pile-label">Discard</div>
              <div className="pile-count">{discardCount}</div>
            </div>
          </>
        )}

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

      {showModal && (
        <PlayerCounterModal
          onAdd={(title, icon) => { onAddCounter?.(title, icon); setShowModal(false); }}
          onCancel={() => setShowModal(false)}
          openedFromBottom={!isOpponent}
        />
      )}
    </>
  );
};

import React, { useState } from 'react';
import { CustomCounter } from '@/features/player/types';
import { PlayerCounter } from './PlayerCounter';
import { PlayerCounterModal } from './PlayerCounterModal';
import styles from './PlayerCounters.module.css';

interface PlayerCountersProps {
  counters: CustomCounter[];
  onModify: (counterId: string, delta: number) => void;
  onRemove: (counterId: string) => void;
  /** When provided, an "add counter" affordance + modal become available. */
  onAdd?: (title: string, icon: string) => void;
  /** Reveal the counter strip (typically only while the widget is hovered). */
  visible?: boolean;
}

/**
 * The custom-counter strip for a player. Owns the add-counter modal so callers
 * only supply the counter data and the mutation callbacks.
 *
 * The strip is hidden unless `visible`, but the modal stays mounted regardless:
 * opening it moves the pointer off the widget (clearing hover), and unmounting
 * the modal in that moment would immediately close it.
 */
export const PlayerCounters: React.FC<PlayerCountersProps> = ({
  counters,
  onModify,
  onRemove,
  onAdd,
  visible = false,
}) => {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      {visible && (
        <div className={styles.counters}>
          {counters.map((counter) => (
            <PlayerCounter
              key={counter.id}
              counter={counter}
              onModify={(delta) => onModify(counter.id, delta)}
              onRemove={() => onRemove(counter.id)}
              showControls
            />
          ))}

          {onAdd && (
            <button
              type="button"
              className={styles.addButton}
              aria-label="Add custom counter"
              title="Add custom counter"
              onClick={() => setShowModal(true)}
            >
              +
            </button>
          )}
        </div>
      )}

      {onAdd && (
        <PlayerCounterModal
          isOpen={showModal}
          onAdd={(title, icon) => {
            onAdd(title, icon);
            setShowModal(false);
          }}
          onCancel={() => setShowModal(false)}
        />
      )}
    </>
  );
};

import React from 'react';
import { Stepper } from './Stepper';
import styles from './Stat.module.css';

interface StatProps {
  /** Optional leading emoji/glyph (used by custom counters). */
  icon?: string;
  /** Short caption above the value; plain text or an editable input node. */
  label: React.ReactNode;
  /** The numeric value; plain text/number or an editable input node. */
  value: React.ReactNode;
  onModify: (delta: number) => void;
  /** When provided, a remove button is shown alongside the stepper. */
  onRemove?: () => void;
  /** Noun used for the stepper/remove accessible labels. */
  name: string;
  orientation?: 'vertical' | 'horizontal';
  size?: 'sm' | 'md';
  /** Hide the stepper/remove controls (e.g. to reveal them only on hover). */
  showControls?: boolean;
}

/**
 * A labeled integer with an increment/decrement stepper — the shared shape
 * behind both the prominent health readout (vertical) and each custom counter
 * chip (horizontal). Health is, structurally, just a counter you can't remove.
 */
export const Stat: React.FC<StatProps> = ({
  icon,
  label,
  value,
  onModify,
  onRemove,
  name,
  orientation = 'vertical',
  size = 'md',
  showControls = true,
}) => (
  <div className={`${styles.stat} ${styles[orientation]}`}>
    {icon && <span className={styles.icon}>{icon}</span>}
    <div className={styles.info}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{value}</span>
    </div>
    {showControls && (
      <div className={styles.controls}>
        <Stepper
          name={name}
          size={size}
          onDecrement={() => onModify(-1)}
          onIncrement={() => onModify(1)}
        />
        {onRemove && (
          <button
            type="button"
            className={styles.remove}
            aria-label={`Remove ${name}`}
            title={`Remove ${name}`}
            onClick={onRemove}
          >
            ×
          </button>
        )}
      </div>
    )}
  </div>
);

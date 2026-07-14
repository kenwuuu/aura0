import React from 'react';
import styles from './Stepper.module.css';

interface StepperProps {
  onDecrement: () => void;
  onIncrement: () => void;
  /** Noun used to build accessible labels, e.g. "health" → "Increase health". */
  name: string;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * A themed increment/decrement control. Colors derive from the ambient
 * `--player-accent` custom property (set by HealthDisplay: purple for the
 * local player, neutral for opponents) without needing a variant prop.
 * Hover tints are semantic: − = danger, + = good (design §03).
 */
export const Stepper: React.FC<StepperProps> = ({
  onDecrement,
  onIncrement,
  name,
  size = 'md',
  className,
}) => (
  <div className={`${styles.stepper} ${styles[size]} ${className ?? ''}`}>
    <button
      type="button"
      className={`${styles.button} ${styles.decrement}`}
      aria-label={`Decrease ${name}`}
      onClick={onDecrement}
    >
      −
    </button>
    <button
      type="button"
      className={`${styles.button} ${styles.increment}`}
      aria-label={`Increase ${name}`}
      onClick={onIncrement}
    >
      +
    </button>
  </div>
);

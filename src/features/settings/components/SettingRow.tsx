/**
 * Generic labeled row used throughout the settings modal.
 *
 * Renders a label (+ optional description) on the left and any control on the
 * right. Keeping all settings visually consistent is the primary goal — every
 * section should use this rather than rolling its own layout.
 */
import React from 'react';
import styles from './SettingRow.module.css';

interface SettingRowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
}

export function SettingRow({ label, description, children }: SettingRowProps) {
  return (
    <div className={styles.row}>
      <div className={styles['label-group']}>
        <span className={styles.label}>{label}</span>
        {description && <span className={styles.description}>{description}</span>}
      </div>
      <div className={styles.control}>{children}</div>
    </div>
  );
}

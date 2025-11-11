import React, { useState, useEffect } from 'react';
import styles from './PlayerCounterModal.module.css';

interface CounterModalProps {
  onAdd: (title: string, icon: string) => void;
  onCancel: () => void;
  openedFromBottom: boolean;
}

const COMMON_ICONS = ['☠️', '⚡', '🔥', '🩸', '☢️', '⭐', '💎', '👑', '⚔️', '🛡️'];

export const PlayerCounterModal: React.FC<CounterModalProps> = ({ onAdd, onCancel, openedFromBottom }) => {
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState('☠️');
  const [customIcon, setCustomIcon] = useState('');

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      onAdd(title.trim(), customIcon || icon);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onCancel}>
      <div className={openedFromBottom ? styles.modalFromBottom : styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>Add Custom Counter</h2>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Title</label>
            <input
              type="text"
              className={styles.input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Poison, Energy, Experience"
              autoFocus
              maxLength={20}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Icon (select or enter custom)</label>
            <div className={styles.iconGrid}>
              {COMMON_ICONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className={`${styles.iconButton} ${icon === emoji && !customIcon ? styles.selected : ''}`}
                  onClick={() => {
                    setIcon(emoji);
                    setCustomIcon('');
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <input
              type="text"
              className={styles.input}
              value={customIcon}
              onChange={(e) => setCustomIcon(e.target.value)}
              placeholder="Or enter custom emoji"
              maxLength={2}
            />
          </div>

          <div className={styles.preview}>
            <div className={styles.previewLabel}>Preview:</div>
            <div className={styles.previewCounter}>
              <span className={styles.previewIcon}>{customIcon || icon}</span>
              <span className={styles.previewTitle}>{title || 'Counter'}</span>
              <span className={styles.previewValue}>0</span>
            </div>
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.cancelButton} onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className={styles.addButton} disabled={!title.trim()}>
              Add Counter
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
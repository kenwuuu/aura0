import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { COUNTER_ICONS } from './iconOptions';
import styles from './PlayerCounterModal.module.css';

interface CounterModalProps {
  isOpen: boolean;
  onAdd: (title: string, icon: string) => void;
  onCancel: () => void;
}

export const PlayerCounterModal: React.FC<CounterModalProps> = ({ isOpen, onAdd, onCancel }) => {
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState('☠️');
  const [customIcon, setCustomIcon] = useState('');

  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setIcon('☠️');
      setCustomIcon('');
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      onAdd(title.trim(), customIcon || icon);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) onCancel();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[450px] w-[90%]">
        <DialogHeader>
          <DialogTitle>Add Custom Counter</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className={`${styles.form} p-6 pt-0`}>
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
              {COUNTER_ICONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={`Use ${emoji} icon`}
                  aria-pressed={icon === emoji && !customIcon}
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
      </DialogContent>
    </Dialog>
  );
};

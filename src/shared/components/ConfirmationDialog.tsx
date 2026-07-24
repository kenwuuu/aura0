import React, { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Checkbox } from '@/shared/ui/checkbox';

interface ConfirmationDialogProps {
  isOpen: boolean;
  message: string;
  confirmKey: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Shows a "Don't ask me again" checkbox below the message. */
  showDontAskAgain?: boolean;
  /** Fires whenever the checkbox is toggled, so the caller can read its final
   *  state at confirm/cancel time without this component owning the setting. */
  onDontAskAgainChange?: (checked: boolean) => void;
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
  } as React.CSSProperties,
  content: {
    backgroundColor: '#1a1a1a',
    border: '2px solid #3d3d3d',
    borderRadius: '16px',
    maxWidth: '500px',
    width: '90%',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8)',
    outline: 'none',
  } as React.CSSProperties,
  header: {
    padding: '20px',
    borderBottom: '2px solid #2d2d2d',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  } as React.CSSProperties,
  title: {
    color: '#ffffff',
    fontSize: '20px',
    margin: 0,
  } as React.CSSProperties,
  close: {
    background: 'none',
    border: 'none',
    color: '#9ca3af',
    fontSize: '32px',
    cursor: 'pointer',
    padding: 0,
    width: '40px',
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '8px',
    transition: 'background-color 0.2s, color 0.2s',
  } as React.CSSProperties,
  body: {
    padding: '24px 20px',
  } as React.CSSProperties,
  message: {
    color: '#e5e7eb',
    fontSize: '16px',
    lineHeight: '1.6',
    marginBottom: '20px',
  } as React.CSSProperties,
  instruction: {
    color: '#9ca3af',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as React.CSSProperties,
  key: {
    fontFamily: "'Courier New', monospace",
    fontWeight: 'bold',
    color: '#3b82f6',
    fontSize: '16px',
    backgroundColor: '#0f0f0f',
    padding: '4px 12px',
    borderRadius: '6px',
    border: '1px solid #3d3d3d',
  } as React.CSSProperties,
  dontAskAgain: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '16px',
    color: '#e5e7eb',
    fontSize: '14px',
    cursor: 'pointer',
  } as React.CSSProperties,
};

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  message,
  confirmKey,
  onConfirm,
  onCancel,
  showDontAskAgain,
  onDontAskAgainChange,
}) => {
  const [dontAskAgain, setDontAskAgain] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === confirmKey.toLowerCase()) {
        e.preventDefault();
        e.stopPropagation();
        onConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, confirmKey, onConfirm, onCancel]);

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay style={styles.overlay}>
          <Dialog.Content style={styles.content} onPointerDownOutside={onCancel}>
            <div style={styles.header}>
              <Dialog.Title style={styles.title}>Confirm Action</Dialog.Title>
              <Dialog.Close asChild>
                <button
                  style={styles.close}
                  onClick={onCancel}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#2d2d2d';
                    e.currentTarget.style.color = '#ffffff';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = '#9ca3af';
                  }}
                >
                  ×
                </button>
              </Dialog.Close>
            </div>
            <div style={styles.body}>
              <p style={styles.message}>{message}</p>
              <div style={styles.instruction}>
                <span>Press</span>
                <kbd style={styles.key}>{confirmKey.toUpperCase()}</kbd>
                <span>to confirm or</span>
                <kbd style={styles.key}>ESC</kbd>
                <span>to cancel</span>
              </div>
              {showDontAskAgain && (
                <label style={styles.dontAskAgain}>
                  <Checkbox
                    aria-label="Don't ask me again"
                    checked={dontAskAgain}
                    onCheckedChange={(checked) => {
                      const next = checked === true;
                      setDontAskAgain(next);
                      onDontAskAgainChange?.(next);
                    }}
                  />
                  Don't ask me again
                </label>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
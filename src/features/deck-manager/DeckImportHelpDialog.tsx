import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';

interface DeckImportHelpDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const styles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    zIndex: 10003,
    animation: 'fadeIn 150ms ease-out',
  },
  content: {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: 'var(--bg-2)',
    border: '1px solid var(--line-2)',
    borderRadius: '8px',
    padding: '24px',
    maxWidth: '500px',
    maxHeight: '85vh',
    overflow: 'auto',
    boxShadow: 'var(--shadow-sheet)',
    zIndex: 10004,
    animation: 'slideIn 200ms ease-out',
  },
  title: {
    color: 'var(--text)',
    fontSize: '18px',
    fontWeight: 600,
    marginBottom: '16px',
    marginTop: 0,
  },
  section: {
    marginBottom: '20px',
  },
  sectionTitle: {
    color: 'var(--accent)',
    fontSize: '14px',
    fontWeight: 600,
    marginBottom: '8px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  text: {
    color: 'var(--text-dim)',
    fontSize: '14px',
    lineHeight: 1.6,
    marginBottom: '8px',
  },
  code: {
    backgroundColor: 'var(--surface)',
    border: '1px solid var(--line-2)',
    borderRadius: '4px',
    padding: '12px',
    fontSize: '13px',
    fontFamily: 'monospace',
    color: 'var(--text)',
    whiteSpace: 'pre-wrap' as const,
    marginBottom: '8px',
  },
  ul: {
    color: 'var(--text-dim)',
    fontSize: '14px',
    lineHeight: 1.6,
    marginLeft: '20px',
    marginBottom: '8px',
  },
  closeButton: {
    marginTop: '16px',
    width: '100%',
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: 600,
    borderRadius: '4px',
    border: 'none',
    backgroundColor: 'var(--accent)',
    color: 'var(--accent-contrast)',
    boxShadow: '0 0 0 1px var(--accent-line), 0 0 14px var(--glow)',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  iconButton: {
    position: 'absolute' as const,
    top: '16px',
    right: '16px',
    width: '32px',
    height: '32px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: 'transparent',
    color: 'var(--text-dim)',
    fontSize: '20px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
};

export function DeckImportHelpDialog({ isOpen, onClose }: DeckImportHelpDialogProps) {
  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay style={styles.overlay} />
        <Dialog.Content style={styles.content}>
          <Dialog.Title style={styles.title}>Deck Import Guide</Dialog.Title>
          <Dialog.Close style={styles.iconButton} onClick={(e) => { e.stopPropagation(); onClose(); }}>×</Dialog.Close>

          <div style={styles.section}>
            <div style={styles.sectionTitle}>Recommended Format</div>
            <p style={styles.text}>
              For best results, use the <strong style={{ color: 'var(--accent)' }}>MTGO preset</strong> from Moxfield's download button:
            </p>
            <div style={styles.code}>
              4 Lightning Bolt{'\n'}
              20 Mountain{'\n'}
              1 Bonfire of the Damned
            </div>
          </div>

          <div style={styles.section}>
            <div style={styles.sectionTitle}>Section Headers</div>
            <p style={styles.text}>
              Headers are fine — your commander and main deck import, and a
              sideboard or maybeboard is skipped:
            </p>
            <div style={styles.code}>
              {`COMMANDER:
1 Flubs, the Fool

DECK:
1 Zuran Orb

SIDEBOARD:      ← skipped
4 Pygmy Pyrosaur`}
            </div>
          </div>

          <div style={styles.section}>
            <div style={styles.sectionTitle}>Supported Formats</div>
            <ul style={styles.ul}>
              <li>Simple quantity + name format (e.g., "4 Lightning Bolt")</li>
              {/*<li>Set codes in parentheses (e.g., "4 Lightning Bolt (M10)")</li>*/}
              <li>Blank lines between cards (ignored)</li>
              <li>Section headers (Commander / Deck imported, Sideboard / Maybeboard skipped)</li>
            </ul>
          </div>

          <button style={styles.closeButton} onClick={(e) => { e.stopPropagation(); onClose(); }}>
            Got it
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
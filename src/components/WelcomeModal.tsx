import React, { useEffect, useState } from 'react';

const VISIT_COUNT_KEY = 'aura-visit-count';
const DISMISSED_KEY = 'aura-welcome-dismissed';

const styles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
  },
  modal: {
    backgroundColor: '#1f1f1f',
    border: '1px solid #3d3d3d',
    borderRadius: '8px',
    padding: '32px',
    maxWidth: '400px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
  },
  h2: {
    color: '#fff',
    fontSize: '20px',
    marginBottom: '16px',
  },
  p: {
    color: '#d1d5db',
    fontSize: '14px',
    lineHeight: 1.6,
    marginBottom: '12px',
  },
  strong: {
    color: '#fff',
  },
  buttons: {
    display: 'flex',
    gap: '12px',
    marginTop: '24px',
  },
  button: {
    flex: 1,
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: 600,
    borderRadius: '6px',
    border: '1px solid #3d3d3d',
    backgroundColor: '#3b82f6',
    color: '#fff',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  buttonSecondary: {
    flex: 1,
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: 600,
    borderRadius: '6px',
    border: '1px solid #4a4a4a',
    backgroundColor: '#2d2d2d',
    color: '#fff',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
};

export const WelcomeModal: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [showDontShowAgain, setShowDontShowAgain] = useState(false);

  useEffect(() => {
    // Check if user has dismissed the modal permanently
    const isDismissed = localStorage.getItem(DISMISSED_KEY) === 'true';
    if (isDismissed) return;

    // Track visit count
    const visitCount = parseInt(localStorage.getItem(VISIT_COUNT_KEY) || '0', 10);
    const newVisitCount = visitCount + 1;
    localStorage.setItem(VISIT_COUNT_KEY, newVisitCount.toString());

    // Show "Don't show again" button from second visit onwards
    if (newVisitCount >= 2) {
      setShowDontShowAgain(true);
    }

    // Show modal
    setIsVisible(true);
  }, []);

  const handleClose = () => {
    setIsVisible(false);
  };

  const handleDontShowAgain = () => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div style={styles.overlay} onClick={handleClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.h2}>Welcome to Aura</h2>
        <p style={styles.p}>
          Import a new deck using the <strong style={styles.strong}>Choose Deck</strong> button in the top left.
        </p>
        <p style={styles.p}>
          View all hotkeys in the <strong style={styles.strong}>Hotkeys</strong> button next to it.
        </p>
        <div style={styles.buttons}>
          {showDontShowAgain && (
            <button style={styles.buttonSecondary} onClick={handleDontShowAgain}>
              Don't show again
            </button>
          )}
          <button style={styles.button} onClick={handleClose}>Got it</button>
        </div>
      </div>
    </div>
  );
};
import React from 'react';
import { getAllHotkeysWithLongDescriptions } from '../data/hotkeys';

interface HotkeysModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const styles = {
  modal: {
    maxWidth: '900px',
    width: '95%',
  } as React.CSSProperties,
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '24px',
  } as React.CSSProperties,
  column: {
    display: 'flex',
    flexDirection: 'column',
  } as React.CSSProperties,
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  } as React.CSSProperties,
  tableHead: {
    textAlign: 'left',
    padding: '12px 16px',
    backgroundColor: '#0f0f0f',
    color: '#9ca3af',
    fontSize: '12px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderBottom: '2px solid #3d3d3d',
  } as React.CSSProperties,
  tableRow: {
    borderBottom: '1px solid #2d2d2d',
  } as React.CSSProperties,
  tableCell: {
    padding: '12px 16px',
  } as React.CSSProperties,
  hotkeyKey: {
    fontFamily: "'Courier New', monospace",
    fontWeight: 'bold',
    color: '#3b82f6',
    fontSize: '14px',
    minWidth: '80px',
  } as React.CSSProperties,
  hotkeyAction: {
    color: '#e5e7eb',
    fontSize: '14px',
  } as React.CSSProperties,
};

export const HotkeysModal: React.FC<HotkeysModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  // Get hotkeys from centralized data source
  const hotkeys = getAllHotkeysWithLongDescriptions();

  // Split into two columns
  const mid = Math.ceil(hotkeys.length / 2);
  const leftColumn = hotkeys.slice(0, mid);
  const rightColumn = hotkeys.slice(mid);

  // Media query for mobile responsiveness
  const isMobile = window.innerWidth <= 768;
  const gridStyle = isMobile
    ? { ...styles.grid, gridTemplateColumns: '1fr' }
    : styles.grid;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Keyboard Shortcuts</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div style={gridStyle}>
            <div style={styles.column}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.tableHead}>Key</th>
                    <th style={styles.tableHead}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {leftColumn.map((hotkey, index) => (
                    <tr key={index} style={styles.tableRow}>
                      <td style={{ ...styles.tableCell, ...styles.hotkeyKey }}>{hotkey.key}</td>
                      <td style={{ ...styles.tableCell, ...styles.hotkeyAction }}>{hotkey.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={styles.column}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.tableHead}>Key</th>
                    <th style={styles.tableHead}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rightColumn.map((hotkey, index) => (
                    <tr key={index} style={styles.tableRow}>
                      <td style={{ ...styles.tableCell, ...styles.hotkeyKey }}>{hotkey.key}</td>
                      <td style={{ ...styles.tableCell, ...styles.hotkeyAction }}>{hotkey.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { HotkeyDefinition, HotkeyContext, getHotkeysForContext } from '../data/hotkeys';

interface HotkeyTooltipProps {
  context: HotkeyContext;
  mouseX: number;
  mouseY: number;
}

const styles = {
  tooltip: {
    position: 'fixed',
    backgroundColor: '#1a1a1a',
    border: '1px solid #3d3d3d',
    borderRadius: '6px',
    padding: '8px 12px',
    pointerEvents: 'none',
    zIndex: 10000,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.6)',
    maxWidth: '280px',
  } as React.CSSProperties,
  hotkeyRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '4px',
    fontSize: '12px',
  } as React.CSSProperties,
  hotkeyRowLast: {
    marginBottom: '0px',
  } as React.CSSProperties,
  hotkeyKey: {
    fontFamily: "'Courier New', monospace",
    fontWeight: 'bold',
    color: '#3b82f6',
    fontSize: '12px',
    minWidth: '50px',
    flexShrink: 0,
  } as React.CSSProperties,
  hotkeyAction: {
    color: '#e5e7eb',
    fontSize: '12px',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,
};

export const HotkeyTooltip: React.FC<HotkeyTooltipProps> = ({ context, mouseX, mouseY }) => {
  const [position, setPosition] = useState({ x: mouseX, y: mouseY });
  const hotkeys = getHotkeysForContext(context);

  useEffect(() => {
    // Offset the tooltip slightly from the cursor
    const offsetX = 15;
    const offsetY = 15;

    // Calculate tooltip position, ensuring it stays within viewport
    let x = mouseX + offsetX;
    let y = mouseY + offsetY;

    // Rough estimate of tooltip dimensions (will be adjusted by browser)
    const tooltipWidth = 280;
    const tooltipHeight = hotkeys.length * 20 + 16; // approximate height

    // Keep tooltip within viewport bounds
    if (x + tooltipWidth > window.innerWidth) {
      x = mouseX - tooltipWidth - offsetX;
    }
    if (y + tooltipHeight > window.innerHeight) {
      y = mouseY - tooltipHeight - offsetY;
    }

    setPosition({ x, y });
  }, [mouseX, mouseY, hotkeys.length]);

  if (hotkeys.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        ...styles.tooltip,
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      {hotkeys.map((hotkey, index) => (
        <div
          key={`${hotkey.key}-${index}`}
          style={{
            ...styles.hotkeyRow,
            ...(index === hotkeys.length - 1 ? styles.hotkeyRowLast : {}),
          }}
        >
          <span style={styles.hotkeyKey}>{hotkey.key}</span>
          <span style={styles.hotkeyAction}>{hotkey.shortDescription}</span>
        </div>
      ))}
    </div>
  );
};
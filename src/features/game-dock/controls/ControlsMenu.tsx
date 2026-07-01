import React, { useState } from 'react';
import styles from './ControlsMenu.module.css';
import { KeywordTokenGrid } from '@/features/keyword-tokens/KeywordTokenGrid';
import { KeywordTokenTemplate } from '@/features/keyword-tokens/types';
import { DEFAULT_TOKEN_TEMPLATES } from '@/features/game-actions/defaultTokenTemplates';

interface ControlsMenuProps {
  onScry: () => void;
  onAddCard: () => void;
  tokenTemplates?: KeywordTokenTemplate[]; // Allow customization
  tokenGridColumns?: number; // Grid columns configuration (default: 5)
  tokenGridRows?: number; // Grid rows configuration (auto if not specified)
  tokenGridGap?: number; // Gap between tokens (default: 12px)
}

const closeDelay = 200;

// Read fade duration from CSS variable
const getFadeDuration = (): number => {
  const duration = getComputedStyle(document.documentElement)
    .getPropertyValue('--fade-duration')
    .trim();
  // Parse CSS time value (e.g., "300ms" -> 300)
  return parseInt(duration) || 300; // Fallback to 300ms
};

export const ControlsMenu: React.FC<ControlsMenuProps> = ({
  onScry,
  onAddCard,
  tokenTemplates = DEFAULT_TOKEN_TEMPLATES,
  tokenGridColumns = 7,
  tokenGridRows,
  tokenGridGap = 12,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const closeTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const fadeDurationRef = React.useRef<number>(getFadeDuration());

  const handleMouseEnter = () => {
    // Clear any pending close timeout
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setIsClosing(false);
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    // Delay closing to allow user to move to expanded menu
    closeTimeoutRef.current = setTimeout(() => {
      startClosing();
    }, closeDelay); // 200ms delay
  };

  const startClosing = () => {
    setIsClosing(true);
    // After fade-down animation completes, actually hide the menu
    setTimeout(() => {
      setIsHovered(false);
      setIsClosing(false);
    }, fadeDurationRef.current); // Match fadeDown animation duration from CSS
  };

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      className={styles.controlsContainer}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className={styles.collapsedContent}>
        <div className={styles.hoverIndicator}>
          <svg
            width="20"
            height="12"
            viewBox="0 0 20 12"
            fill="none"
            className={styles.arrowIcon}
          >
            <path
              d="M10 2L15 8H5L10 2Z"
              fill="currentColor"
              opacity="0.6"
            />
          </svg>
        </div>
        <button
          className="draw-button"
          onClick={onScry}
          title="Scry"
        >
          Scry
        </button>
        <button
          className="draw-button"
          onClick={onAddCard}
          title="Add Card (A)"
        >
          Add Card
        </button>
      </div>

      {(isHovered || isClosing) && (
        <div className={`${styles.expandedContent} ${isClosing ? styles.closing : ''}`}>
          <KeywordTokenGrid
            templates={tokenTemplates}
            columns={tokenGridColumns}
            rows={tokenGridRows}
            gap={tokenGridGap}
          />
        </div>
      )}
    </div>
  );
};
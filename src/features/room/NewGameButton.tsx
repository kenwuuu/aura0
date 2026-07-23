import React from 'react';
import { DoorOpen } from 'lucide-react';
import { requestNewGame } from './startNewGame';

export const NewGameButton: React.FC = () => {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    requestNewGame();
  };

  return (
    <button
      id="new-game-button"
      data-testid="new-game-button"
      onClick={handleClick}
      aria-label="Start a new game in a new room"
    >
      {/* Text collapses below `sm` (see "Toolbar responsive collapse" in
          style.css); the icon plus aria-label above stay the affordance. */}
      <span className="toolbar-link-label">NEW GAME </span>
      <DoorOpen size={18} style={{ verticalAlign: 'middle' }} />
    </button>
  );
};

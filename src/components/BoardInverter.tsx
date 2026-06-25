import React from 'react';
import * as Y from 'yjs';
import { YDOC_INVERTED_BOARDS } from '@/constants';
import { FlipVertical2 } from 'lucide-react';

interface BoardInverterProps {
  yDoc: Y.Doc;
  localPlayerId: string;
}

export const BoardInverter: React.FC<BoardInverterProps> = ({ yDoc, localPlayerId }) => {
  const [isInverted, setIsInverted] = React.useState(false);

  React.useEffect(() => {
    const yInvertedBoards = yDoc.getArray(YDOC_INVERTED_BOARDS);

    // Initialize state
    const invertedPlayers = yInvertedBoards.toArray() as string[];
    setIsInverted(invertedPlayers.includes(localPlayerId));

    // Observer for changes
    const observer = () => {
      const invertedPlayers = yInvertedBoards.toArray() as string[];
      setIsInverted(invertedPlayers.includes(localPlayerId));
    };

    yInvertedBoards.observe(observer);

    return () => {
      yInvertedBoards.unobserve(observer);
    };
  }, [yDoc, localPlayerId]);

  const toggleInversion = () => {
    const yInvertedBoards = yDoc.getArray(YDOC_INVERTED_BOARDS);
    const invertedPlayers = yInvertedBoards.toArray() as string[];

    if (invertedPlayers.includes(localPlayerId)) {
      // Remove from inverted boards
      const index = invertedPlayers.indexOf(localPlayerId);
      yInvertedBoards.delete(index, 1);
    } else {
      // Add to inverted boards
      yInvertedBoards.push([localPlayerId]);
    }
  };

  return (
    <button
      id="board-inverter"
      onClick={toggleInversion}
      className={`p-2 rounded hover:bg-gray-700 transition-colors ${isInverted ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-800'}`}
      title={isInverted ? 'Board inverted' : 'Board normal'}
      aria-label="Toggle board inversion"
    >
      <FlipVertical2 size={20} className={isInverted ? 'text-white' : 'text-gray-400'} />
    </button>
  );
};

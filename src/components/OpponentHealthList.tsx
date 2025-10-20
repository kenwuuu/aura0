import React, { useState, useEffect } from 'react';
import * as Y from 'yjs';
import { HealthDisplay } from './HealthDisplay';

interface OpponentHealthListProps {
  yDoc: Y.Doc;
  localPlayerId: string;
}

interface OpponentData {
  playerId: string;
  health: number;
}

export const OpponentHealthList: React.FC<OpponentHealthListProps> = ({
  yDoc,
  localPlayerId,
}) => {
  const [opponents, setOpponents] = useState<OpponentData[]>([]);

  useEffect(() => {
    const updateOpponents = () => {
      const opponentsList: OpponentData[] = [];

      yDoc.share.forEach((value, key) => {
        if (key.startsWith('player-') && key !== `player-${localPlayerId}`) {
          const playerId = key.replace('player-', '');
          const yPlayerState = yDoc.getMap(key);
          const health = (yPlayerState.get('health') as number | undefined) ?? 20;

          opponentsList.push({ playerId, health });
        }
      });

      setOpponents(opponentsList);
    };

    // Initial update
    updateOpponents();

    // Set up observers for all player states
    const observerCleanups: Array<() => void> = [];

    const setupObservers = () => {
      yDoc.share.forEach((value, key) => {
        if (key.startsWith('player-') && key !== `player-${localPlayerId}`) {
          const yPlayerState = yDoc.getMap(key);
          const observer = () => updateOpponents();
          yPlayerState.observe(observer);
          observerCleanups.push(() => yPlayerState.unobserve(observer));
        }
      });
    };

    setupObservers();

    // Check for new players periodically and reset observers
    const interval = setInterval(() => {
      // Clean up old observers
      observerCleanups.forEach(cleanup => cleanup());
      observerCleanups.length = 0;
      // Setup new observers
      setupObservers();
      updateOpponents();
    }, 1000);

    return () => {
      clearInterval(interval);
      observerCleanups.forEach(cleanup => cleanup());
    };
  }, [yDoc, localPlayerId]);

  const modifyOpponentHealth = (playerId: string, delta: number) => {
    const yPlayerState = yDoc.getMap(`player-${playerId}`);
    const currentHealth = (yPlayerState.get('health') as number | undefined) ?? 20;
    yPlayerState.set('health', currentHealth + delta);
  };

  return (
    <>
      {opponents.map((opponent) => (
        <HealthDisplay
          key={opponent.playerId}
          label="Opponent"
          health={opponent.health}
          onModifyHealth={(delta) => modifyOpponentHealth(opponent.playerId, delta)}
          variant="opponent"
          playerId={opponent.playerId}
        />
      ))}
    </>
  );
};
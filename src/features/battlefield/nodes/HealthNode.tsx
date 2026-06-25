import React, { memo } from 'react';
import { NodeProps } from '@xyflow/react';
import * as Y from 'yjs';
import { HealthDisplay } from '@/features/opponents/HealthDisplay';
import { CustomCounter } from '@/features/player/types';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import {
  modifyOpponentHealth,
  addOpponentCounter,
  modifyOpponentCounter,
  removeOpponentCounter,
} from '@/features/opponents/opponentPlayerMutations';

export interface HealthNodeData {
  ownerId: string;
  isLocal: boolean;
  name: string;
  health: number;
  customCounters: CustomCounter[];
  yDoc: Y.Doc;
}

/**
 * HealthNode — per-player health / name / custom-counter widget on the board.
 *
 * Wraps the existing HealthDisplay component. Local player mutations go through
 * the Player instance in gameInstanceStore; opponent mutations write directly to
 * their Yjs map via opponentPlayerMutations helpers.
 *
 * The `nodrag` class on the wrapper prevents react-flow from treating pointer
 * events inside the widget as a node-drag gesture.
 */
export const HealthNode = memo(function HealthNode({ data }: NodeProps) {
  const d = data as unknown as HealthNodeData;
  const { ownerId, isLocal, name, health, customCounters, yDoc } = d;

  const onModifyHealth = (delta: number) => {
    if (isLocal) {
      useGameInstance.getState().player?.modifyHealth(delta);
    } else {
      modifyOpponentHealth(yDoc, ownerId, delta);
    }
  };

  const onRename = isLocal
    ? (newName: string) => useGameInstance.getState().player?.setName(newName)
    : undefined;

  const onAddCounter = (title: string, icon: string) => {
    if (isLocal) {
      useGameInstance.getState().player?.addCustomCounter(title, icon);
    } else {
      addOpponentCounter(yDoc, ownerId, title, icon);
    }
  };

  const onModifyCounter = (counterId: string, delta: number) => {
    if (isLocal) {
      useGameInstance.getState().player?.modifyCustomCounter(counterId, delta);
    } else {
      modifyOpponentCounter(yDoc, ownerId, counterId, delta);
    }
  };

  const onRemoveCounter = (counterId: string) => {
    if (isLocal) {
      useGameInstance.getState().player?.removeCustomCounter(counterId);
    } else {
      removeOpponentCounter(yDoc, ownerId, counterId);
    }
  };

  return (
    // nodrag: prevents react-flow from treating button clicks as drag starts
    <div className="nodrag" onPointerDown={(e) => e.stopPropagation()}>
      <HealthDisplay
        label={name}
        health={health}
        onModifyHealth={onModifyHealth}
        onRename={onRename}
        variant={isLocal ? 'local' : 'opponent'}
        playerId={ownerId}
        customCounters={customCounters}
        onAddCounter={onAddCounter}
        onModifyCounter={onModifyCounter}
        onRemoveCounter={onRemoveCounter}
      />
    </div>
  );
});

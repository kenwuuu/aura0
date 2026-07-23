import React, { memo } from 'react';
import { NodeProps } from '@xyflow/react';
import * as Y from 'yjs';
import { HealthDisplay } from '@/features/opponents/HealthDisplay';
import { CustomCounter } from '@/features/player/types';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { useContextMenuStore } from '@/features/hotkeys/contextMenuStore';
import { isPlayerOnline } from '@/features/player/removePlayer';

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
 * Wraps the existing HealthDisplay component. All mutations (self or opponent)
 * go through the local Player instance — it's the only Player instance that
 * exists, and it can target any player's Yjs map, since only the local player
 * can click their own board widgets.
 *
 * The `nodrag` class on the wrapper prevents react-flow from treating pointer
 * events inside the widget as a node-drag gesture.
 */
export const HealthNode = memo(function HealthNode({ data }: NodeProps) {
  const d = data as unknown as HealthNodeData;
  const { ownerId, isLocal, name, health, customCounters } = d;

  const onModifyHealth = (delta: number) => {
    useGameInstance.getState().player?.modifyHealth(delta, ownerId);
  };

  const onRename = isLocal
    ? (newName: string) => useGameInstance.getState().player?.setName(newName)
    : undefined;

  const onAddCounter = (title: string, icon: string) => {
    useGameInstance.getState().player?.addCustomCounter(title, icon, ownerId);
  };

  const onModifyCounter = (counterId: string, delta: number) => {
    useGameInstance.getState().player?.modifyCustomCounter(counterId, delta, ownerId);
  };

  const onRemoveCounter = (counterId: string) => {
    useGameInstance.getState().player?.removeCustomCounter(counterId, ownerId);
  };

  // The local player's widget always has a menu (the +1/-1 life actions target
  // `player.modifyHealth()` with no targetPlayerId, implicitly self). An
  // opponent's widget gets one only once they've *left* the room — it carries a
  // single "Remove player" action (see GameContextMenu). An online opponent's
  // widget still just suppresses the native browser menu, so the board
  // consistently feels like "right-click opens our menu everywhere".
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const { awareness } = useGameInstance.getState();
    const shouldOpen = isLocal || (!!awareness && !isPlayerOnline(awareness, ownerId));
    if (!shouldOpen) return;
    useContextMenuStore.getState().openMenu({
      target: { kind: 'health', ownerId },
      x: e.clientX,
      y: e.clientY,
    });
  };

  return (
    // nodrag: prevents react-flow from treating button clicks as drag starts
    <div className="nodrag" onPointerDown={(e) => e.stopPropagation()} onContextMenu={handleContextMenu}>
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

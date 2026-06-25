import React, { useState, useCallback } from 'react';
import { HandCardsContainer } from './HandCardsContainer';
import { usePlayerStore } from '@/app/stores/playerStore';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { useHotkeyStore } from '@/app/stores/hotkeyStore';
import type { Card } from '@/features/player';

export function FloatingHand() {
  const yPlayerState = usePlayerStore((s) => s.yPlayerState);
  const player = useGameInstance((s) => s.player);
  const playerId = useGameInstance((s) => s.playerId);
  const [zoomLevel, setZoomLevel] = useState(() =>
    parseFloat(localStorage.getItem('hand-zoom') || '1'),
  );

  const adjustZoom = useCallback((delta: number) => {
    setZoomLevel((prev) => {
      const next = Math.max(0.5, Math.min(3.5, prev + delta));
      localStorage.setItem('hand-zoom', String(next));
      return next;
    });
  }, []);

  const resetZoom = useCallback(() => {
    setZoomLevel(1);
    localStorage.setItem('hand-zoom', '1');
  }, []);

  const handleHoveredCardChange = useCallback((cardId: string | null) => {
    useHotkeyStore.getState().setHoveredHandCard(cardId);
  }, []);

  const handleHandReorder = useCallback(
    (reorderedHand: Card[]) => {
      player?.reorderHand(reorderedHand);
    },
    [player],
  );

  if (!yPlayerState || !playerId) return null;

  return (
    <>
      {/* Zoom controls — fixed bottom-left */}
      <div
        className="zoom-controls hand-zoom-controls"
        style={{
          position: 'fixed',
          bottom: 8,
          left: 8,
          zIndex: 950,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <button className="zoom-button" onClick={() => adjustZoom(0.2)} title="Zoom In Hand Cards">
          +
        </button>
        <button
          className="zoom-button zoom-display"
          onClick={resetZoom}
          title="Reset Hand Zoom"
          style={{ fontSize: '12px' }}
        >
          {zoomLevel.toFixed(1)}×
        </button>
        <button className="zoom-button" onClick={() => adjustZoom(-0.2)} title="Zoom Out Hand Cards">
          −
        </button>
      </div>

      {/* Hand cards — centered horizontally */}
      <div
        style={{
          position: 'fixed',
          bottom: 8,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 950,
        }}
      >
        <HandCardsContainer
          yPlayerState={yPlayerState}
          playerId={playerId}
          zoomLevel={zoomLevel}
          onHoveredCardChange={handleHoveredCardChange}
          onHandReorder={handleHandReorder}
          adjustHandZoom={adjustZoom}
        />
      </div>
    </>
  );
}

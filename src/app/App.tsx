import React, { useState, useCallback, useEffect, useRef } from 'react';
import * as Y from 'yjs';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';

import { BattlefieldCanvas } from '@/features/battlefield/BattlefieldCanvas';
import { CardPreview } from '@/features/card-preview';
import { HotkeyMenu } from '@/features/hotkeys/HotkeyMenu';
import { GameHotkeysManager } from '@/features/hotkeys/GameHotkeysManager';
import { OpponentPileViewers } from '@/features/opponents/OpponentPileViewers';
import { FloatingHand } from '@/features/game-dock/FloatingHand';
import { FloatingControlsMenu } from '@/features/game-dock/controls/FloatingControlsMenu';
import { ScryManager } from '@/features/game-dock/ScryManager';
import { LocalPileTiles } from '@/features/game-dock/LocalPileTiles';
import { DeckManager } from '@/features/deck-manager';
import { loadDeck } from '@/features/deck-manager/deckLoading';
import { RoomManager } from '@/features/room';
import { RoomLinkButton } from '@/features/room/RoomLinkButton';
import { Player } from '@/features/player';
import type { Card } from '@/features/player/types';
import { SavedDeck } from '@/features/player/types';
import { CardLookupService, TokenService } from '@/infrastructure/cards';
import { YjsNetworkProvider } from '@/infrastructure/networking/YjsNetworkFactory';
import { RoomConnectionStatus } from '@/features/room/RoomConnectionStatus';
import { AddCardManager } from '@/features/deck-manager/AddCardManager';
import { WelcomeModal } from '@/app/WelcomeModal';
import { AnnouncementModal } from '@/app/AnnouncementModal';
import { Toaster } from '@/shared/ui/sonner';
import { AnnouncementsService } from '@/shared/services/announcements/AnnouncementsService';
import { HelpButton, HotkeysButton, DiscordButton } from './ToolbarButtons';
import { useGameInstance } from './stores/gameInstanceStore';
import { useCardPreviewStore } from '@/features/card-preview/cardPreviewStore';
import { DEFAULT_CARD_BACK } from '@/constants';

const isDevEnv = import.meta.env.MODE === 'development';

interface AppProps {
  yDoc: Y.Doc;
  yjsNetworkProvider: YjsNetworkProvider;
  player: Player;
  roomManager: RoomManager;
  playerId: string;
  cardLookup: CardLookupService;
  tokenService: TokenService;
}

function CardDragOverlay({ card }: { card: Card }) {
  const imageUrl = card.isFlipped
    ? (card.images?.back?.normal ?? DEFAULT_CARD_BACK)
    : card.images?.front?.normal;
  return (
    <div style={{
      width: 63, height: 88,
      borderRadius: 8,
      overflow: 'hidden',
      boxShadow: '0 12px 40px rgba(0,0,0,0.8)',
      background: '#2d2d2d',
      cursor: 'grabbing',
    }}>
      {imageUrl && (
        <img src={imageUrl} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
      )}
    </div>
  );
}

export function App({ yDoc, yjsNetworkProvider, player, roomManager, playerId, cardLookup, tokenService }: AppProps) {
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const lastPointerRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const track = (e: PointerEvent) => { lastPointerRef.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener('pointermove', track);
    return () => window.removeEventListener('pointermove', track);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const card = player.getState().hand.find(c => c.id === event.active.id);
    setActiveCard(card ?? null);
    useCardPreviewStore.getState().hide();
  }, [player]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCard(null);

    const cardId = active.id as string;

    if (over?.id === 'battlefield') {
      const { x, y } = lastPointerRef.current;
      useGameInstance.getState().playCardFromHand(cardId, x, y);
      return;
    }

    if (typeof over?.id === 'string' && over.id.startsWith('pile-')) {
      // id format: pile-{pileKind}-{ownerId}  (ownerId may contain hyphens)
      const withoutPrefix = over.id.slice('pile-'.length);
      const dashIdx = withoutPrefix.indexOf('-');
      const pileKind = withoutPrefix.slice(0, dashIdx) as 'exile' | 'discard' | 'deck';
      const pileOwnerId = withoutPrefix.slice(dashIdx + 1);
      if (pileOwnerId !== playerId) return; // only local piles
      const card = player.getState().hand.find(c => c.id === cardId);
      if (!card) return;
      player.removeCardFromHand(cardId);
      player.placeCardInPile(card, pileKind);
      return;
    }

    if (over && over.id !== active.id) {
      // Reorder within hand
      const hand = player.getState().hand;
      const oldIndex = hand.findIndex(c => c.id === active.id);
      const newIndex = hand.findIndex(c => c.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        player.reorderHand(arrayMove(hand, oldIndex, newIndex));
      }
    }
  }, [player, playerId]);

  const handleDeckSelected = (deck: SavedDeck) => loadDeck(player, roomManager, deck);
  const handleAddCard = (card: Parameters<Player['placeCardInPile']>[0]) =>
    player.placeCardInPile(card, 'hand');

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      {/* ── Toolbar ── */}
      <div id="toolbar">
        <DeckManager onDeckSelected={handleDeckSelected} />
        <HotkeysButton />
        <HelpButton />
        <DiscordButton />
        <span id="connection-status">
          <RoomConnectionStatus yjsNetworkProvider={yjsNetworkProvider} />
        </span>
        <RoomLinkButton />
      </div>

      {/* ── Battlefield (fills remaining viewport height) ── */}
      <div id="whiteboard">
        <BattlefieldCanvas
          yDoc={yDoc}
          localPlayerId={playerId}
          player={player}
          tokenService={tokenService}
        />
      </div>

      {/* ── Fixed-position overlays ── */}
      <FloatingHand />
      <FloatingControlsMenu />
      <ScryManager />
      <LocalPileTiles />
      <OpponentPileViewers yDoc={yDoc} localPlayerId={playerId} />
      <CardPreview />
      <HotkeyMenu />
      <GameHotkeysManager />
      <Toaster />
      {!isDevEnv && <WelcomeModal />}
      {AnnouncementsService.shouldShowAnnouncement() && (
        <AnnouncementModal onClose={() => AnnouncementsService.markAnnouncementAsSeen()} />
      )}
      <AddCardManager cardLookup={cardLookup} onAddCard={handleAddCard} />

      <DragOverlay dropAnimation={null}>
        {activeCard && <CardDragOverlay card={activeCard} />}
      </DragOverlay>
    </DndContext>
  );
}

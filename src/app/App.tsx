import React, { useState, useCallback, useEffect, useRef } from 'react';
import * as Y from 'yjs';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { snapCenterToCursor } from '@dnd-kit/modifiers';
import { arrayMove } from '@dnd-kit/sortable';
import { coordinatesFromPointerEvent, coordinatesFromTouchMoveEvent } from './dragDropCoordinates';

import { BattlefieldCanvas } from '@/features/battlefield/BattlefieldCanvas';
import { CardPreview } from '@/features/card-preview';
import { GameContextMenu } from '@/features/hotkeys/GameContextMenu';
// TODO(context-menu-rollout stage 4): HotkeyMenu now only ever renders in its
// `hint` mode (TokenNode / KeywordTokenGrid hover hints) — every actionable
// menu has moved to GameContextMenu. Remove this once those hover hints are
// replaced by their own context-menu wiring, and delete HotkeyMenu +
// hotkeyMenuStore alongside it.
import { HotkeyMenu } from '@/features/hotkeys/HotkeyMenu';
import { GameHotkeysManager } from '@/features/hotkeys/GameHotkeysManager';
import { OpponentPileViewers } from '@/features/opponents/OpponentPileViewers';
import { FloatingHand } from '@/features/game-dock/FloatingHand';
import { ScryManager } from '@/features/game-dock/ScryManager';
import { LocalPileTiles } from '@/features/game-dock/LocalPileTiles';
import { loadDeck } from '@/features/deck-manager/deckLoading';
import { RoomManager } from '@/features/room';
import { Player } from '@/features/player';
import type { Card, PileType } from '@/features/player/types';
import { SavedDeck } from '@/features/player/types';
import { CardLookupService, TokenService } from '@/infrastructure/cards';
import { YjsNetworkProvider } from '@/infrastructure/networking/YjsNetworkFactory';
import { AddCardManager } from '@/features/deck-manager/AddCardManager';
import { WelcomeModal } from '@/app/WelcomeModal';
import { AnnouncementModal } from '@/app/AnnouncementModal';
import { SettingsModal } from '@/features/settings/SettingsModal';
import { ActionLogPanel } from '@/features/action-log/ActionLogPanel';
import { logAction } from '@/features/action-log/actionLog';
import { GameActionsToolbar } from '@/features/game-actions/GameActionsToolbar';
import { NumberPromptManager } from '@/features/game-actions/NumberPromptManager';
import { ConfirmDialogManager } from '@/app/ConfirmDialogManager';
import { TokenCardSearchModal } from '@/features/game-actions/TokenCardSearchModal';
import { Toaster } from '@/shared/ui/sonner';
import { AnnouncementsService } from '@/shared/services/announcements/AnnouncementsService';
import { Toolbar } from './Toolbar';
import { playCardFromHand } from '@/features/battlefield/battlefieldActions';
import { useCardPreviewStore } from '@/features/card-preview/cardPreviewStore';
import { useSettingsStore } from './stores/settingsStore';
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

function CardDragOverlay({ card, zoom }: { card: Card; zoom: number }) {
  const imageUrl = card.isFlipped
    ? (card.images?.back?.normal ?? DEFAULT_CARD_BACK)
    : card.images?.front?.normal;
  return (
    <div style={{
      width: 63 * zoom, height: 88 * zoom,
      borderRadius: 8,
      overflow: 'hidden',
      boxShadow: '0 12px 40px rgba(0,0,0,0.8)',
      background: '#2d2d2d',
      cursor: 'grabbing',
    }}>
      {imageUrl && (
        <img src={imageUrl} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', borderRadius: 2 }} />
      )}
    </div>
  );
}

export function App({ yDoc, yjsNetworkProvider, player, roomManager, playerId, cardLookup, tokenService }: AppProps) {
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [activeZoom, setActiveZoom] = useState(1);
  const lastPointerRef = useRef({ x: 0, y: 0 });

  // Track the live pointer position directly rather than deriving it from
  // dnd-kit's DragEndEvent (see dragDropCoordinates.ts for why). touchmove is
  // tracked explicitly, not just pointermove, so this stays correct even if a
  // browser doesn't synthesize pointer-compatibility events for a touch drag.
  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => { lastPointerRef.current = coordinatesFromPointerEvent(e); };
    const onTouchMove = (e: TouchEvent) => {
      const pos = coordinatesFromTouchMoveEvent(e);
      if (pos) lastPointerRef.current = pos;
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    // Long-press to drag on touch: 300ms hold without moving > 5px starts the drag.
    // During the delay window dnd-kit does not call preventDefault, so the browser
    // can still scroll the hand horizontally on a quick swipe.
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 5 } }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const card = player.getState().hand.find(c => c.id === event.active.id);
    setActiveCard(card ?? null);
    setActiveZoom(useSettingsStore.getState().handZoom);
    useCardPreviewStore.getState().hide();
  }, [player]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCard(null);

    const cardId = active.id as string;

    if (over?.id === 'battlefield') {
      const { x, y } = lastPointerRef.current;
      playCardFromHand(cardId, x, y);
      return;
    }

    if (typeof over?.id === 'string' && over.id.startsWith('pile-')) {
      // id format: pile-{pileKind}-{ownerId}  (ownerId may contain hyphens)
      const withoutPrefix = over.id.slice('pile-'.length);
      const dashIdx = withoutPrefix.indexOf('-');
      const pileKind = withoutPrefix.slice(0, dashIdx) as Exclude<PileType, 'hand' | 'scry'>;
      const pileOwnerId = withoutPrefix.slice(dashIdx + 1);
      if (pileOwnerId !== playerId) return; // only local piles
      const card = player.getState().hand.find(c => c.id === cardId);
      if (!card) return;
      player.movePileCard(card, 'hand', pileKind);
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
  const handleAddCard = (card: Parameters<Player['placeCardInPile']>[0]) => {
    player.placeCardInPile(card, 'hand');
    logAction(yDoc, { actorId: playerId, type: 'add_card', text: `added ${card.name} to hand from outside the game` });
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      {/* ── Toolbar ── */}
      <Toolbar yjsNetworkProvider={yjsNetworkProvider} onDeckSelected={handleDeckSelected} />

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
      <ScryManager />
      <LocalPileTiles />
      <OpponentPileViewers yDoc={yDoc} localPlayerId={playerId} />
      <ActionLogPanel yDoc={yDoc} localPlayerId={playerId} />
      <GameActionsToolbar />
      <NumberPromptManager />
      <ConfirmDialogManager />
      <TokenCardSearchModal cardLookup={cardLookup} />
      <CardPreview />
      <GameContextMenu />
      <HotkeyMenu />
      <GameHotkeysManager />
      <Toaster />
      <SettingsModal />
      {!isDevEnv && <WelcomeModal />}
      {AnnouncementsService.shouldShowAnnouncement() && (
        <AnnouncementModal onClose={() => AnnouncementsService.markAnnouncementAsSeen()} />
      )}
      <AddCardManager cardLookup={cardLookup} onAddCard={handleAddCard} />

      <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>
        {activeCard && <CardDragOverlay card={activeCard} zoom={activeZoom} />}
      </DragOverlay>
    </DndContext>
  );
}

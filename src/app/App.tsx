/**
 * App — the single React root for Aura (Phase 5).
 *
 * Previously the app had ~17 separate `createRoot()` calls scattered across
 * `src/index.ts`. This component consolidates all React UI into one tree so
 * components share context and renders are coordinated.
 *
 * index.html retains its existing mount-point divs (toolbar slots, etc.) for now.
 * Components that must live inside those static HTML elements render via
 * `createPortal`. Fixed-position overlays (zoom controls, card preview, menus,
 * modals) are direct children and rendered into the React root div.
 *
 * Full restructure of index.html → single <div id="root"> (dropping portals) is
 * deferred to Phase 6, which already rewrites the board DOM region.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import * as Y from 'yjs';

import { ZoomControls } from '@/features/battlefield/ZoomControls';
import { CardPreview } from '@/features/card-preview';
import { HotkeyMenu } from '@/features/hotkeys/HotkeyMenu';
import { GameHotkeysManager } from '@/features/hotkeys/GameHotkeysManager';
import { OpponentHealthList } from '@/features/opponents/OpponentHealthList';
import { DeckManager } from '@/features/deck-manager';
import { loadDeck } from '@/features/deck-manager/deckLoading';
import { RoomManager } from '@/features/room';
import { Player } from '@/features/player';
import { SavedDeck } from '@/features/player/types';
import { CardLookupService } from '@/infrastructure/cards';
import { YjsNetworkProvider } from '@/infrastructure/networking/YjsNetworkFactory';
import { RoomConnectionStatus } from '@/components/RoomConnectionStatus';
import { AddCardManager } from '@/components/AddCardManager';
import { MobileWarningModal } from '@/components/MobileWarningModal';
import { WelcomeModal } from '@/components/WelcomeModal';
import { AnnouncementModal } from '@/components/AnnouncementModal';
import { Toaster } from '@/shared/ui/sonner';
import { AnnouncementsService } from '@/services/announcements/AnnouncementsService';
import { HelpButton, HotkeysButton, DiscordButton } from './ToolbarButtons';

const isDevEnv = import.meta.env.MODE === 'development';

interface AppProps {
  yDoc: Y.Doc;
  yjsNetworkProvider: YjsNetworkProvider;
  player: Player;
  roomManager: RoomManager;
  playerId: string;
  cardLookup: CardLookupService;
}

export function App({ yDoc, yjsNetworkProvider, player, roomManager, playerId, cardLookup }: AppProps) {
  const handleDeckSelected = (deck: SavedDeck) => loadDeck(player, roomManager, deck);
  const handleAddCard = (card: Parameters<Player['placeCardInPile']>[0]) =>
    player.placeCardInPile(card, 'hand');

  return (
    <>
      {/* ── Fixed-position overlays (DOM location irrelevant) ── */}
      <ZoomControls />
      <CardPreview />
      <HotkeyMenu />
      <GameHotkeysManager />
      <Toaster />
      <MobileWarningModal />
      {!isDevEnv && <WelcomeModal />}
      {AnnouncementsService.shouldShowAnnouncement() && (
        <AnnouncementModal onClose={() => AnnouncementsService.markAnnouncementAsSeen()} />
      )}
      <AddCardManager cardLookup={cardLookup} onAddCard={handleAddCard} />

      {/* ── Portals into existing index.html toolbar slots ── */}
      {createPortal(
        <DeckManager onDeckSelected={handleDeckSelected} />,
        document.getElementById('deck-manager-root')!,
      )}
      {createPortal(
        <OpponentHealthList yDoc={yDoc} localPlayerId={playerId} />,
        document.getElementById('opponent-health-container')!,
      )}
      {createPortal(
        <RoomConnectionStatus yjsNetworkProvider={yjsNetworkProvider} />,
        document.getElementById('connection-status')!,
      )}
      {createPortal(<HelpButton />, document.getElementById('help-root')!)}
      {createPortal(<HotkeysButton />, document.getElementById('hotkeys-root')!)}
      {createPortal(<DiscordButton />, document.getElementById('discord-root')!)}
    </>
  );
}

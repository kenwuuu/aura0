import React from 'react';
import * as Y from 'yjs';

import { BattlefieldCanvas } from '@/features/battlefield/BattlefieldCanvas';
import { CardPreview } from '@/features/card-preview';
import { HotkeyMenu } from '@/features/hotkeys/HotkeyMenu';
import { GameHotkeysManager } from '@/features/hotkeys/GameHotkeysManager';
import { OpponentHealthList } from '@/features/opponents/OpponentHealthList';
import { DeckManager } from '@/features/deck-manager';
import { loadDeck } from '@/features/deck-manager/deckLoading';
import { RoomManager } from '@/features/room';
import { RoomLinkButton } from '@/features/room/RoomLinkButton';
import { Player } from '@/features/player';
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

export function App({ yDoc, yjsNetworkProvider, player, roomManager, playerId, cardLookup, tokenService }: AppProps) {
  const handleDeckSelected = (deck: SavedDeck) => loadDeck(player, roomManager, deck);
  const handleAddCard = (card: Parameters<Player['placeCardInPile']>[0]) =>
    player.placeCardInPile(card, 'hand');

  return (
    <>
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
      <div id="opponent-health-container">
        <OpponentHealthList yDoc={yDoc} localPlayerId={playerId} />
      </div>
      <CardPreview />
      <HotkeyMenu />
      <GameHotkeysManager />
      <Toaster />
      {!isDevEnv && <WelcomeModal />}
      {AnnouncementsService.shouldShowAnnouncement() && (
        <AnnouncementModal onClose={() => AnnouncementsService.markAnnouncementAsSeen()} />
      )}
      <AddCardManager cardLookup={cardLookup} onAddCard={handleAddCard} />
    </>
  );
}

import * as Y from 'yjs';
import { GameDndProvider } from './GameDndProvider';

import { BattlefieldCanvas } from '@/features/battlefield/BattlefieldCanvas';
import { CardPreview } from '@/features/card-preview';
import { HotkeyMenu } from '@/features/hotkeys/HotkeyMenu';
import { GameHotkeysManager } from '@/features/hotkeys/GameHotkeysManager';
import { OpponentPileViewers } from '@/features/opponents/OpponentPileViewers';
import { FloatingHand } from '@/features/game-dock/FloatingHand';
import { ScryManager } from '@/features/game-dock/ScryManager';
import { LocalPileTiles } from '@/features/game-dock/LocalPileTiles';
import { loadDeck } from '@/features/deck-manager/deckLoading';
import { RoomManager } from '@/features/room';
import { Player } from '@/features/player';
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
  const handleAddCard = (card: Parameters<Player['placeCardInPile']>[0]) => {
    player.placeCardInPile(card, 'hand');
    logAction(yDoc, { actorId: playerId, type: 'add_card', text: `added ${card.name} to hand from outside the game` });
  };

  return (
    <GameDndProvider player={player} playerId={playerId}>
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
      <HotkeyMenu />
      <GameHotkeysManager />
      <Toaster />
      <SettingsModal />
      {!isDevEnv && <WelcomeModal />}
      {AnnouncementsService.shouldShowAnnouncement() && (
        <AnnouncementModal onClose={() => AnnouncementsService.markAnnouncementAsSeen()} />
      )}
      <AddCardManager cardLookup={cardLookup} onAddCard={handleAddCard} />
    </GameDndProvider>
  );
}

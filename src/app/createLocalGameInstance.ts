/**
 * createLocalGameInstance — the networking-free core of `bootstrapGame()`.
 *
 * SPIKE (task 3 de-risk): proves the real board can run with no y-webrtc, no
 * persistence, and no deck autoload. It creates the Y.Doc + Player + services
 * and populates the same Zustand stores `bootstrapGame()` does, but stops there.
 * `awareness` is left null — every board consumer (BattlefieldCanvas,
 * useBattlefieldNodes, usePeerCursors) already guards for it.
 *
 * Productionizing task 3 means having `bootstrapGame()` delegate to this for its
 * "core" phase and then layer networking/persistence on top, so the app and the
 * demo share one code path instead of two.
 */
import * as Y from 'yjs';
import { Player } from '@/features/player';
import type { Card } from '@/features/player/types';
import { CardLookupService, TokenService } from '@/infrastructure/cards';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { usePlayerStore } from '@/app/stores/playerStore';

export interface LocalGameInstance {
  yDoc: Y.Doc;
  player: Player;
  playerId: string;
  tokenService: TokenService;
  cardLookup: CardLookupService;
}

export function createLocalGameInstance(opts: {
  playerId: string;
  deck?: Card[] | null;
  initialHealth?: number;
}): LocalGameInstance {
  // Fresh doc — no network provider, so state never leaves this tab.
  const yDoc = new Y.Doc();
  const player = new Player(opts.playerId, yDoc, opts.deck ?? null, {
    initialHealth: opts.initialHealth ?? 40,
  });

  // Any component reading yPlayerState gets it on first mount.
  usePlayerStore.getState().setYPlayerState(player.yPlayerState);

  const cardLookup = new CardLookupService();
  const tokenService = new TokenService(cardLookup);

  const gi = useGameInstance.getState();
  gi.reset(); // awareness back to null; clears any prior instance in this tab
  gi.setYDoc(yDoc);
  gi.setPlayer(player);
  gi.setPlayerId(opts.playerId);
  gi.setTokenService(tokenService);

  return { yDoc, player, playerId: opts.playerId, tokenService, cardLookup };
}

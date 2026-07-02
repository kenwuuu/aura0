/**
 * `renderWithGame` — the golden-path render for component tests.
 *
 * Seeds a real `Y.Doc` + `Player` into the game/player Zustand stores, then
 * renders `ui`. Components under test hit real Yjs and real stores without
 * prop-drilling — the same wiring `bootstrapGame()` does in production.
 *
 * Stores are reset centrally in `setup.ts` (`afterEach`), so tests never clean
 * up store state by hand. Returns the RTL result plus the seeded game handles.
 */

import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';
import { seedGame, type SeedGameOptions, type SeededGame } from './seedGame';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { usePlayerStore } from '@/app/stores/playerStore';

export type RenderWithGameOptions = SeedGameOptions & {
  /** Passed through to RTL's `render` (e.g. a custom `container`). */
  renderOptions?: RenderOptions;
};

export type RenderWithGameResult = ReturnType<typeof render> & SeededGame;

export function renderWithGame(
  ui: ReactElement,
  { renderOptions, ...seedOptions }: RenderWithGameOptions = {},
): RenderWithGameResult {
  const game = seedGame(seedOptions);

  const gameStore = useGameInstance.getState();
  gameStore.setYDoc(game.yDoc);
  gameStore.setPlayer(game.player);
  gameStore.setPlayerId(game.playerId);
  usePlayerStore.getState().setYPlayerState(game.player.yPlayerState);

  const result = render(ui, renderOptions);
  return Object.assign(result, game);
}

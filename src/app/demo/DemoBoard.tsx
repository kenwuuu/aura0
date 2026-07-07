/**
 * DemoBoard — the task-3 spike. Runs the REAL battlefield (BattlefieldCanvas +
 * GameActionsToolbar + card preview + right-click menu) from a networking-free
 * local instance, on its own isolated `demo.html` entry. No landing bundle, no
 * y-webrtc, no persistence — just proof the board stands up on its own.
 *
 * The instance is created once in `demo-main.tsx` (before render) and passed in,
 * mirroring how `main.ts` boots the real app from `bootstrapGame()`. Creating it
 * inside render (useMemo/useState) is unsafe: the factory writes to the game
 * store, and React would double-invoke it, leaving the store's Y.Doc and the
 * board's Y.Doc out of sync.
 *
 * Interactions that work here: hover a card (preview), right-click a card
 * (tap/flip/… menu), and the toolbar's Untap All / Draw / Pass / Actions.
 */
import { BattlefieldCanvas } from '@/features/battlefield/BattlefieldCanvas';
import { GameActionsToolbar } from '@/features/game-actions/GameActionsToolbar';
import { FloatingHand } from '@/features/game-dock/FloatingHand';
import { CardPreview } from '@/features/card-preview';
import { HotkeyMenu } from '@/features/hotkeys/HotkeyMenu';
import { NumberPromptManager } from '@/features/game-actions/NumberPromptManager';
import { GameDndProvider } from '@/app/GameDndProvider';
import type { LocalGameInstance } from '@/app/createLocalGameInstance';

export function DemoBoard({ instance }: { instance: LocalGameInstance }) {
  return (
    // GameDndProvider supplies the same DndContext + hand-drag handlers the real
    // app uses, so hand→board / hand→pile drops work here too.
    <GameDndProvider player={instance.player} playerId={instance.playerId}>
      <div style={{ position: 'fixed', inset: 0 }}>
        <BattlefieldCanvas
          yDoc={instance.yDoc}
          localPlayerId={instance.playerId}
          player={instance.player}
          tokenService={instance.tokenService}
        />
      </div>
      <GameActionsToolbar />
      <FloatingHand />
      <NumberPromptManager />
      <CardPreview />
      <HotkeyMenu />
    </GameDndProvider>
  );
}

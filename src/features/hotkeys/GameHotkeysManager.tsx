/**
 * Game Hotkeys Manager
 *
 * Single centralized component that owns ALL game hotkeys. It renders nothing —
 * it sets up the react-hotkeys-hook <HotkeysProvider> (so contextual bindings
 * can be gated by scope) and runs the unified useAllGameHotkeys hook inside it.
 *
 * Game instances are accessed from gameInstanceStore, so no props are needed.
 */

import { HotkeysProvider } from 'react-hotkeys-hook';
import { HotkeyScope } from '@/features/hotkeys/hotkeys';
import { useAllGameHotkeys } from '@/features/hotkeys/useAllGameHotkeys';

// Must live inside the provider so useAllGameHotkeys can call useHotkeysContext.
function GameHotkeysRunner() {
  useAllGameHotkeys();
  return null;
}

export function GameHotkeysManager() {
  return (
    <HotkeysProvider initiallyActiveScopes={[HotkeyScope.Board]}>
      <GameHotkeysRunner />
    </HotkeysProvider>
  );
}

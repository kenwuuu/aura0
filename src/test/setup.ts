import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { usePlayerStore } from '@/app/stores/playerStore';
import { useHotkeyStore } from '@/app/stores/hotkeyStore';
import { useTooltipStore } from '@/app/stores/uiStore';
import { useCardPreviewStore } from '@/features/card-preview/cardPreviewStore';

/**
 * Reset all module-singleton Zustand stores between tests so state never leaks
 * across tests within a file. Specs must NOT reset these by hand — seed via the
 * test harness (`renderWithGame`) instead. RTL's DOM cleanup is registered
 * automatically by @testing-library/react when globals are enabled.
 */
afterEach(() => {
  useGameInstance.getState().reset();
  usePlayerStore.setState({ yPlayerState: null });
  useHotkeyStore.setState({ hoverTarget: null, isModalOpen: false, addCardModalOpen: false });
  useTooltipStore.setState({ isTooltipOpen: false });
  useCardPreviewStore.setState({
    card: null,
    source: null,
    isVisible: false,
    mouseX: 0,
    mouseY: 0,
  });
});

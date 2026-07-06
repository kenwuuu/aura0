import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { usePlayerStore } from '@/app/stores/playerStore';
import { useHotkeyStore } from '@/app/stores/hotkeyStore';
import { useSettingsStore } from '@/app/stores/settingsStore';
import { useCardPreviewStore } from '@/features/card-preview/cardPreviewStore';
import { useHotkeyMenuStore } from '@/features/hotkeys/hotkeyMenuStore';
import { usePileViewerOpenStore } from '@/features/game-dock/pileViewerOpenStore';
import { usePileViewerHotkeyStore } from '@/features/game-dock/pileViewerHotkeyStore';
import { useScryStore } from '@/features/game-dock/scryStore';
import { useSurveilStore } from '@/features/game-dock/surveilStore';
import { useTokenCardSearchStore } from '@/features/game-actions/tokenCardSearchStore';
import { useNumberPromptStore } from '@/features/game-actions/numberPromptStore';

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
  useCardPreviewStore.setState({
    card: null,
    source: null,
    isVisible: false,
    mouseX: 0,
    mouseY: 0,
  });
  useHotkeyMenuStore.setState({
    isOpen: false,
    mode: 'menu',
    context: null,
    cardId: null,
    title: undefined,
    onSelect: null,
  });
  usePileViewerOpenStore.setState({ request: null });
  usePileViewerHotkeyStore.setState({ actionHandler: null });
  useScryStore.setState({ requested: false });
  useSurveilStore.setState({ requested: false });
  useTokenCardSearchStore.setState({ isOpen: false });
  useNumberPromptStore.setState({ request: null });
  useSettingsStore.setState({
    handZoom: 1,
    previewZoom: 1,
    snapToGridEnabled: false,
    demoHandCards: null,
  });
  localStorage.clear();
});

import React from 'react';
import { ControlsMenu } from './ControlsMenu';
import { useScryStore } from '../scryStore';
import { useHotkeyStore } from '@/app/stores/hotkeyStore';

export function FloatingControlsMenu() {
  return (
    <div style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 900 }}>
      <ControlsMenu
        onScry={() => useScryStore.getState().request()}
        onAddCard={() => useHotkeyStore.getState().setAddCardModalOpen(true)}
      />
    </div>
  );
}

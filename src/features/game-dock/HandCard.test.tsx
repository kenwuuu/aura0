import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HandCard } from './HandCard';
import { useContextMenuStore } from '@/features/hotkeys/contextMenuStore';
import { makeCard } from '@/test/factories';

function renderHandCard(overrides: Partial<Parameters<typeof makeCard>[0]> = {}) {
  const card = makeCard({ id: 'card-1', name: 'Lightning Bolt', ...overrides });
  return render(
    <HandCard
      card={card}
      onMouseEnter={vi.fn()}
      onMouseMove={vi.fn()}
      onMouseLeave={vi.fn()}
      onRequestPreview={vi.fn()}
    />,
  );
}

describe('HandCard — right-click opens the context menu', () => {
  it('opens the hand-card context menu for this card', () => {
    renderHandCard();

    fireEvent.contextMenu(screen.getByTestId('hand-card'));

    const menu = useContextMenuStore.getState();
    expect(menu.isOpen).toBe(true);
    expect(menu.target).toEqual({ kind: 'handCard', id: 'card-1' });
  });
});

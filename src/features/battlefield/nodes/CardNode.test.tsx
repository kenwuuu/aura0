import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as Y from 'yjs';
import { CardNode } from './CardNode';
import { renderNode } from '@/test/nodeHarness';
import { makeCard } from '@/test/factories';
import { YDOC_CARDS_ON_BOARD, YDOC_KEYWORD_TOKENS, DEFAULT_CARD_BACK } from '@/constants';
import { useCardPreviewStore } from '@/features/card-preview/cardPreviewStore';
import { useHotkeyStore } from '@/app/stores/hotkeyStore';
import { useHotkeyMenuStore } from '@/features/hotkeys/hotkeyMenuStore';
import { HotkeyContext } from '@/features/hotkeys/hotkeys';
import type { Card } from '@/features/player/types';

/**
 * Characterization tests for CardNode's CURRENT behavior, written before the
 * planned extraction of the face/rotation logic into pure functions. They assert
 * observable behavior (image + alt shown, hover drives the preview store,
 * right-click opens the hotkey menu) so they stay green across that extraction
 * and prove it changed nothing. See tests/testing-react.md.
 */

const PLAYER = 'p1';
const NODE_ID = 'bolt';

/** Build CardNode's `data` bag: a card plus the maps/ids the handlers close over. */
function cardNodeData(card: Card, yCards: Y.Map<unknown>, yTokens: Y.Map<unknown>) {
  return { ...card, zIndex: 0, ownerId: PLAYER, yCards, yTokens, localPlayerId: PLAYER };
}

/** Render CardNode with fresh Yjs maps; returns them so a test can drive Yjs. */
function renderCard(card: Card) {
  const yDoc = new Y.Doc();
  const yCards = yDoc.getMap(YDOC_CARDS_ON_BOARD);
  const yTokens = yDoc.getMap(YDOC_KEYWORD_TOKENS);
  const result = renderNode(CardNode, cardNodeData(card, yCards, yTokens), {
    playerId: PLAYER,
    nodeProps: { id: NODE_ID },
  });
  return { ...result, yCards, yTokens };
}

describe('CardNode — face rendering', () => {
  it('shows the front image with the card name as alt when not flipped', () => {
    renderCard(makeCard({ name: 'Lightning Bolt', images: { front: { normal: 'front.png' } } }));

    const img = screen.getByAltText('Lightning Bolt');
    expect(img).toHaveAttribute('src', 'front.png');
  });

  it('shows the card back when flipped', () => {
    renderCard(
      makeCard({
        name: 'Lightning Bolt',
        isFlipped: true,
        images: { front: { normal: 'front.png' }, back: { normal: 'back.png' } },
      }),
    );

    const img = screen.getByAltText('Card Back');
    expect(img).toHaveAttribute('src', 'back.png');
  });

  it('falls back to the default card back when flipped with no back image', () => {
    renderCard(
      makeCard({ isFlipped: true, images: { front: { normal: 'front.png' } } }),
    );

    expect(screen.getByAltText('Card Back')).toHaveAttribute('src', DEFAULT_CARD_BACK);
  });

  it('renders a #cardNumber placeholder when the front image is missing', () => {
    renderCard(makeCard({ cardNumber: 7, images: { front: null, back: { normal: 'back.png' } } }));

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('#7')).toBeInTheDocument();
  });
});

describe('CardNode — tap rotation', () => {
  // Transitional: rotation is an inline transform with no accessible handle. This
  // node-level guard is superseded by the pure resolveCardRotation() unit test
  // once the math is extracted; kept here to pin the wiring through extraction.
  it('rotates 90° when tapped', () => {
    const { container } = renderCard(makeCard({ isTapped: true, rotation: 0 }));
    expect(container.firstChild).toHaveStyle({ transform: 'rotate(90deg)' });
  });

  it('adds tap rotation on top of the card rotation', () => {
    const { container } = renderCard(makeCard({ isTapped: true, rotation: 90 }));
    expect(container.firstChild).toHaveStyle({ transform: 'rotate(180deg)' });
  });
});

describe('CardNode — hover drives the card preview', () => {
  it('shows the card in the preview store on hover and hides it on leave', async () => {
    const user = userEvent.setup();
    const { container } = renderCard(makeCard({ name: 'Lightning Bolt' }));
    const frame = container.firstChild as Element;

    await user.hover(frame);
    expect(useCardPreviewStore.getState().isVisible).toBe(true);
    expect(useCardPreviewStore.getState().card?.name).toBe('Lightning Bolt');
    expect(useHotkeyStore.getState().hoverTarget).toEqual({ kind: 'battlefield', id: NODE_ID });

    await user.unhover(frame);
    expect(useCardPreviewStore.getState().isVisible).toBe(false);
    expect(useHotkeyStore.getState().hoverTarget).toBeNull();
  });
});

describe('CardNode — right-click opens the hotkey menu', () => {
  it('opens the battlefield context menu for this card', () => {
    const { container } = renderCard(makeCard({ name: 'Lightning Bolt' }));

    fireEvent.contextMenu(container.firstChild as Element);

    const menu = useHotkeyMenuStore.getState();
    expect(menu.isOpen).toBe(true);
    expect(menu.mode).toBe('menu');
    expect(menu.cardId).toBe(NODE_ID);
    expect(menu.context).toBe(HotkeyContext.Battlefield);
  });
});

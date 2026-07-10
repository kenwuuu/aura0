import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import * as Y from 'yjs';
import { TokenNode } from './TokenNode';
import { renderNode } from '@/test/nodeHarness';
import { makeToken } from '@/test/factories';
import { YDOC_KEYWORD_TOKENS } from '@/constants';
import { useHotkeyStore } from '@/app/stores/hotkeyStore';
import { useContextMenuStore } from '@/features/hotkeys/contextMenuStore';
import type { KeywordToken } from '@/features/keyword-tokens/types';

const LOCAL_PLAYER = 'p1';
const NODE_ID = 'flying-token';

/** Render TokenNode with a fresh Yjs token map seeded with `token` under NODE_ID. */
function renderToken(token: KeywordToken, localPlayerId = LOCAL_PLAYER) {
  const yDoc = new Y.Doc();
  const yTokens = yDoc.getMap<KeywordToken>(YDOC_KEYWORD_TOKENS);
  yTokens.set(NODE_ID, token);

  const result = renderNode(
    TokenNode,
    { ...token, yTokens, localPlayerId },
    { playerId: localPlayerId, nodeProps: { id: NODE_ID } },
  );
  return { ...result, yTokens };
}

/** happy-dom doesn't run layout, so getBoundingClientRect() is always zeroed —
 * stub it per-test to drive TokenNode's top-half/bottom-half click gesture. */
function clickAt(el: Element, clientY: number, rect: { top: number; height: number } = { top: 0, height: 20 }) {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    ...rect, bottom: rect.top + rect.height, left: 0, right: 0, width: 0, x: 0, y: rect.top,
    toJSON: () => {},
  } as DOMRect);
  fireEvent.click(el, { clientY });
}

describe('TokenNode — click adjusts the owner\'s own token count', () => {
  it('clicking the top half increments', () => {
    const { container, yTokens } = renderToken(makeToken({ ownerId: LOCAL_PLAYER, count: 2 }));

    clickAt(container.firstChild as Element, 2); // near the top of a 20px-tall token

    expect(yTokens.get(NODE_ID)?.count).toBe(3);
  });

  it('clicking the bottom half decrements', () => {
    const { container, yTokens } = renderToken(makeToken({ ownerId: LOCAL_PLAYER, count: 2 }));

    clickAt(container.firstChild as Element, 18); // near the bottom of a 20px-tall token

    expect(yTokens.get(NODE_ID)?.count).toBe(1);
  });

  it('does not change another player\'s token count', () => {
    const { container, yTokens } = renderToken(makeToken({ ownerId: 'p2', count: 2 }), LOCAL_PLAYER);

    clickAt(container.firstChild as Element, 2);

    expect(yTokens.get(NODE_ID)?.count).toBe(2);
  });
});

describe('TokenNode — right-click opens the context menu', () => {
  it('opens the token context menu for this token', () => {
    const { container } = renderToken(makeToken({ ownerId: LOCAL_PLAYER }));

    fireEvent.contextMenu(container.firstChild as Element);

    const menu = useContextMenuStore.getState();
    expect(menu.isOpen).toBe(true);
    expect(menu.target).toEqual({ kind: 'token', id: NODE_ID });
  });

  it('opens the menu even for another player\'s token (same as battlefield cards)', () => {
    const { container } = renderToken(makeToken({ ownerId: 'p2' }), LOCAL_PLAYER);

    fireEvent.contextMenu(container.firstChild as Element);

    expect(useContextMenuStore.getState().isOpen).toBe(true);
  });
});

describe('TokenNode — hover tracks the hotkey hover target', () => {
  it('sets and clears hoverTarget on enter/leave', async () => {
    const { container } = renderToken(makeToken({ ownerId: LOCAL_PLAYER, title: 'Flying' }));
    const frame = container.firstChild as Element;

    fireEvent.mouseEnter(frame);
    expect(useHotkeyStore.getState().hoverTarget).toEqual({ kind: 'token', id: NODE_ID });

    fireEvent.mouseLeave(frame);
    expect(useHotkeyStore.getState().hoverTarget).toBeNull();
  });
});

describe('TokenNode — hover shows the increment/decrement affordance', () => {
  it('renders the top/bottom shading only while the owner hovers', () => {
    const { container } = renderToken(makeToken({ ownerId: LOCAL_PLAYER }));
    const frame = container.firstChild as Element;

    expect(screen.queryByTestId('token-adjust-shading')).not.toBeInTheDocument();

    fireEvent.mouseEnter(frame);
    expect(screen.getByTestId('token-adjust-shading')).toBeInTheDocument();

    fireEvent.mouseLeave(frame);
    expect(screen.queryByTestId('token-adjust-shading')).not.toBeInTheDocument();
  });

  it('does not show the affordance for another player\'s token', () => {
    const { container } = renderToken(makeToken({ ownerId: 'p2' }), LOCAL_PLAYER);

    fireEvent.mouseEnter(container.firstChild as Element);

    expect(screen.queryByTestId('token-adjust-shading')).not.toBeInTheDocument();
  });
});

describe('TokenNode — rendering', () => {
  it('shows the token image with its title as alt and the count overlay', () => {
    renderToken(makeToken({ title: 'Flying', imageUrl: 'https://img/flying.svg', count: 3 }));

    expect(screen.getByAltText('Flying')).toHaveAttribute('src', 'https://img/flying.svg');
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('exposes the token title as a native tooltip', () => {
    const { container } = renderToken(makeToken({ title: 'Flying' }));

    expect(container.firstChild).toHaveAttribute('title', 'Flying');
  });
});

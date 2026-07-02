import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as Y from 'yjs';
import { TokenNode } from './TokenNode';
import { renderNode } from '@/test/nodeHarness';
import { makeToken } from '@/test/factories';
import { YDOC_KEYWORD_TOKENS } from '@/constants';
import { useHotkeyStore } from '@/app/stores/hotkeyStore';
import { useHotkeyMenuStore } from '@/features/hotkeys/hotkeyMenuStore';
import { HotkeyContext } from '@/features/hotkeys/hotkeys';
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

describe('TokenNode — count changes are owner-gated', () => {
  it("left-click increments the owner's own token count", async () => {
    const user = userEvent.setup();
    const { container, yTokens } = renderToken(makeToken({ ownerId: LOCAL_PLAYER, count: 2 }));

    await user.click(container.firstChild as Element);

    expect(yTokens.get(NODE_ID)?.count).toBe(3);
  });

  it("right-click decrements the owner's own token count", () => {
    const { container, yTokens } = renderToken(makeToken({ ownerId: LOCAL_PLAYER, count: 2 }));

    fireEvent.contextMenu(container.firstChild as Element);

    expect(yTokens.get(NODE_ID)?.count).toBe(1);
  });

  it("left-click does not change another player's token count", async () => {
    const user = userEvent.setup();
    const { container, yTokens } = renderToken(makeToken({ ownerId: 'p2', count: 2 }), LOCAL_PLAYER);

    await user.click(container.firstChild as Element);

    expect(yTokens.get(NODE_ID)?.count).toBe(2);
  });
});

describe('TokenNode — hover shows a hotkey hint', () => {
  it('shows a hint for this token on hover and closes it on leave', async () => {
    const user = userEvent.setup();
    const { container } = renderToken(makeToken({ ownerId: LOCAL_PLAYER, title: 'Flying' }));
    const frame = container.firstChild as Element;

    await user.hover(frame);
    expect(useHotkeyStore.getState().hoverTarget).toEqual({ kind: 'token', id: NODE_ID });
    const hint = useHotkeyMenuStore.getState();
    expect(hint.isOpen).toBe(true);
    expect(hint.mode).toBe('hint');
    expect(hint.context).toBe(HotkeyContext.KeywordToken);
    expect(hint.title).toBe('Flying');

    await user.unhover(frame);
    expect(useHotkeyStore.getState().hoverTarget).toBeNull();
    expect(useHotkeyMenuStore.getState().isOpen).toBe(false);
  });
});

describe('TokenNode — rendering', () => {
  it('shows the token image with its title as alt and the count overlay', () => {
    renderToken(makeToken({ title: 'Flying', imageUrl: 'https://img/flying.svg', count: 3 }));

    expect(screen.getByAltText('Flying')).toHaveAttribute('src', 'https://img/flying.svg');
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});

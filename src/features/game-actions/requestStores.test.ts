/**
 * The three request/consume seams the game actions use to reach a modal that
 * they can't hold a reference to.
 *
 * They're tested together because they're one pattern, not three: an action
 * fires a request, a component mounted elsewhere picks it up, and then *clears*
 * it. The clear is the part worth pinning — a request left set is a modal that
 * reopens on the next unrelated render, which is exactly the failure the
 * `consume`/`close` half exists to prevent. Their `open` halves are already
 * exercised through `dispatchGameAction` (see `hotkeys/gameActions.test.ts`);
 * these cover the round trip.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useNumberPromptStore } from './numberPromptStore';
import { useTokenCardSearchStore } from './tokenCardSearchStore';
import { useTokenTrayStore } from './tokenTrayStore';

describe('numberPromptStore', () => {
  beforeEach(() => useNumberPromptStore.getState().consume());

  it('holds the request until it is consumed, then clears it', () => {
    const request = { title: 'Mill', label: 'How many?', onConfirm: () => {} };

    useNumberPromptStore.getState().open(request);
    expect(useNumberPromptStore.getState().request).toBe(request);

    useNumberPromptStore.getState().consume();
    expect(useNumberPromptStore.getState().request).toBeNull();
  });

  it('replaces a pending request rather than queueing behind it', () => {
    const first = { title: 'Draw Cards', label: 'How many?', onConfirm: () => {} };
    const second = { title: 'Mill', label: 'How many?', onConfirm: () => {} };

    useNumberPromptStore.getState().open(first);
    useNumberPromptStore.getState().open(second);

    expect(useNumberPromptStore.getState().request).toBe(second);
  });
});

describe('tokenCardSearchStore', () => {
  beforeEach(() => useTokenCardSearchStore.getState().close());

  it('opens and closes', () => {
    expect(useTokenCardSearchStore.getState().isOpen).toBe(false);

    useTokenCardSearchStore.getState().open();
    expect(useTokenCardSearchStore.getState().isOpen).toBe(true);

    useTokenCardSearchStore.getState().close();
    expect(useTokenCardSearchStore.getState().isOpen).toBe(false);
  });
});

describe('tokenTrayStore', () => {
  beforeEach(() => useTokenTrayStore.getState().close());

  it('opens and closes', () => {
    expect(useTokenTrayStore.getState().isOpen).toBe(false);

    useTokenTrayStore.getState().open();
    expect(useTokenTrayStore.getState().isOpen).toBe(true);

    useTokenTrayStore.getState().close();
    expect(useTokenTrayStore.getState().isOpen).toBe(false);
  });
});

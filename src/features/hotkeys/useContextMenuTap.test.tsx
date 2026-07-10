/**
 * Unit coverage for the touch tap-to-open gesture. The end-to-end behaviour
 * (real touch events across Chromium/WebKit) lives in
 * tests/e2e/app/board/mobile_tap_context_menu.spec.ts; here we pin the pure
 * decision logic: touch-only, drag-aware, and click-swallowing.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { useContextMenuTap } from './useContextMenuTap';
import { useContextMenuStore } from './contextMenuStore';
import type { MenuTarget } from './hotkeys';

const TARGET: MenuTarget = { kind: 'battlefieldCard', id: 'card-1' };

function Probe({ target = TARGET, onClick }: { target?: MenuTarget | null; onClick?: () => void }) {
  const tap = useContextMenuTap(target);
  return <div data-testid="probe" onClick={onClick} {...tap} />;
}

/** Fire a down→up pair on the probe. `travel` offsets the up point (a drag). */
function tap(pointerType: 'touch' | 'mouse', travel = 0) {
  const el = screen.getByTestId('probe');
  fireEvent.pointerDown(el, { pointerType, pointerId: 1, clientX: 100, clientY: 100 });
  fireEvent.pointerUp(el, { pointerType, pointerId: 1, clientX: 100 + travel, clientY: 100 });
}

describe('useContextMenuTap', () => {
  beforeEach(() => useContextMenuStore.setState({ isOpen: false, target: null, x: 0, y: 0 }));

  it('opens the menu for the target on a touch tap', () => {
    render(<Probe />);
    tap('touch');
    const state = useContextMenuStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.target).toEqual(TARGET);
    expect(state).toMatchObject({ x: 100, y: 100 });
  });

  it('ignores a mouse press (desktop keeps right-click for the menu)', () => {
    render(<Probe />);
    tap('mouse');
    expect(useContextMenuStore.getState().isOpen).toBe(false);
  });

  it('ignores a touch that travels past the tap tolerance (a drag/pan)', () => {
    render(<Probe />);
    tap('touch', 40);
    expect(useContextMenuStore.getState().isOpen).toBe(false);
  });

  it('opts out when the target is null (e.g. an opponent pile)', () => {
    render(<Probe target={null} />);
    tap('touch');
    expect(useContextMenuStore.getState().isOpen).toBe(false);
  });

  it('swallows the click a tap synthesises, so the element\'s own onClick is skipped', () => {
    const onClick = vi.fn();
    render(<Probe onClick={onClick} />);
    tap('touch');
    fireEvent.click(screen.getByTestId('probe'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('leaves a real mouse click through to the element\'s onClick', () => {
    const onClick = vi.fn();
    render(<Probe onClick={onClick} />);
    tap('mouse');
    fireEvent.click(screen.getByTestId('probe'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

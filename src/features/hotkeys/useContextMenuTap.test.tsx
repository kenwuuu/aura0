/**
 * Unit coverage for the touch tap gesture. The end-to-end behaviour (real
 * touch events across Chromium/WebKit) lives in
 * tests/e2e/app/board/mobile_tap_context_menu.spec.ts and
 * mobile_card_preview.spec.ts; here we pin the pure decision logic: touch-only,
 * drag-aware, click-swallowing, and the two-tap preview→menu machine.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { useContextMenuTap } from './useContextMenuTap';
import { useContextMenuStore } from './contextMenuStore';
import { useCardPreviewStore } from '@/features/card-preview/cardPreviewStore';
import type { MenuTarget } from './hotkeys';
import type { Card } from '@/features/player/types';

const CARD_TARGET: MenuTarget = { kind: 'battlefieldCard', id: 'card-1' };
const TOKEN_TARGET: MenuTarget = { kind: 'token', id: 'tok-1' };

function card(id: string): Card {
  return { id } as Card;
}

/** A card surface whose `showPreview` actually drives the preview store, so the
 * two-tap machine can read a real "preview visible for this id" state.
 * `menuFirst` picks the order: preview→menu (hand, pile-viewer) or menu→preview
 * (battlefield). */
function CardProbe({
  target = CARD_TARGET,
  onClick,
  menuFirst = false,
}: { target?: MenuTarget; onClick?: () => void; menuFirst?: boolean }) {
  const tap = useContextMenuTap(target, {
    menuFirst,
    showPreview: (x, y) => {
      const id = 'id' in target ? target.id : 'card-1';
      useCardPreviewStore.getState().show(card(id));
      useCardPreviewStore.getState().updatePosition(x, y);
    },
  });
  return <div data-testid={`probe-${'id' in target ? target.id : 'x'}`} onClick={onClick} {...tap} />;
}

/** A non-card surface (token/pile/board): no `showPreview`, single-tap → menu. */
function PlainProbe({ target = TOKEN_TARGET, onClick }: { target?: MenuTarget | null; onClick?: () => void }) {
  const tap = useContextMenuTap(target);
  return <div data-testid="probe-plain" onClick={onClick} {...tap} />;
}

/** Fire a down→up pair on a probe. `travel` offsets the up point (a drag). */
function tap(testid: string, pointerType: 'touch' | 'mouse', travel = 0) {
  const el = screen.getByTestId(testid);
  fireEvent.pointerDown(el, { pointerType, pointerId: 1, clientX: 100, clientY: 100 });
  fireEvent.pointerUp(el, { pointerType, pointerId: 1, clientX: 100 + travel, clientY: 100 });
}

describe('useContextMenuTap', () => {
  beforeEach(() => {
    useContextMenuStore.setState({ isOpen: false, target: null, x: 0, y: 0 });
    useCardPreviewStore.getState().hide();
  });

  describe('non-card surface (single tap → menu)', () => {
    it('opens the menu for the target on a touch tap', () => {
      render(<PlainProbe />);
      tap('probe-plain', 'touch');
      const state = useContextMenuStore.getState();
      expect(state.isOpen).toBe(true);
      expect(state.target).toEqual(TOKEN_TARGET);
      expect(state).toMatchObject({ x: 100, y: 100 });
    });

    it('ignores a mouse press (desktop keeps right-click for the menu)', () => {
      render(<PlainProbe />);
      tap('probe-plain', 'mouse');
      expect(useContextMenuStore.getState().isOpen).toBe(false);
    });

    it('ignores a touch that travels past the tap tolerance (a drag/pan)', () => {
      render(<PlainProbe />);
      tap('probe-plain', 'touch', 40);
      expect(useContextMenuStore.getState().isOpen).toBe(false);
    });

    it('opts out when the target is null (e.g. an opponent pile)', () => {
      render(<PlainProbe target={null} />);
      tap('probe-plain', 'touch');
      expect(useContextMenuStore.getState().isOpen).toBe(false);
    });

    it('clears any stray preview so preview and menu are never both visible', () => {
      useCardPreviewStore.getState().show(card('other'));
      render(<PlainProbe />);
      tap('probe-plain', 'touch');
      expect(useCardPreviewStore.getState().isVisible).toBe(false);
      expect(useContextMenuStore.getState().isOpen).toBe(true);
    });

    it('swallows the click a tap synthesises, so the element\'s own onClick is skipped', () => {
      const onClick = vi.fn();
      render(<PlainProbe onClick={onClick} />);
      tap('probe-plain', 'touch');
      fireEvent.click(screen.getByTestId('probe-plain'));
      expect(onClick).not.toHaveBeenCalled();
    });

    it('leaves a real mouse click through to the element\'s onClick', () => {
      const onClick = vi.fn();
      render(<PlainProbe onClick={onClick} />);
      tap('probe-plain', 'mouse');
      fireEvent.click(screen.getByTestId('probe-plain'));
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('trailing synthetic click', () => {
    it('swallows a click at the tap coordinates even when it lands on another element (menu opened under the finger)', () => {
      const menuClick = vi.fn();
      render(
        <>
          <PlainProbe />
          <div data-testid="under-finger" onClick={menuClick} />
        </>,
      );
      tap('probe-plain', 'touch'); // taps at (100, 100), arming the coord swallow
      // The trailing compat click lands on a *different* element (a menu that
      // opened under the finger) but at the same coordinates — it's swallowed so
      // it can't activate a menu row and close the just-opened menu.
      fireEvent.click(screen.getByTestId('under-finger'), { clientX: 100, clientY: 100 });
      expect(menuClick).not.toHaveBeenCalled();
    });

    it('leaves a click at different coordinates clickable (a deliberate menu-row tap)', () => {
      const rowClick = vi.fn();
      render(
        <>
          <PlainProbe />
          <div data-testid="menu-row" onClick={rowClick} />
        </>,
      );
      tap('probe-plain', 'touch'); // taps at (100, 100)
      // A real, later tap on a menu row is at different coordinates — not swallowed.
      fireEvent.click(screen.getByTestId('menu-row'), { clientX: 300, clientY: 300 });
      expect(rowClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('card surface (two-tap: preview → menu)', () => {
    it('first tap shows this card\'s preview and opens no menu', () => {
      render(<CardProbe />);
      tap('probe-card-1', 'touch');
      const preview = useCardPreviewStore.getState();
      expect(preview.isVisible).toBe(true);
      expect(preview.card?.id).toBe('card-1');
      expect(useContextMenuStore.getState().isOpen).toBe(false);
    });

    it('second tap on the same card opens its menu and hides the preview', () => {
      render(<CardProbe />);
      tap('probe-card-1', 'touch'); // preview
      tap('probe-card-1', 'touch'); // menu
      expect(useCardPreviewStore.getState().isVisible).toBe(false);
      const menu = useContextMenuStore.getState();
      expect(menu.isOpen).toBe(true);
      expect(menu.target).toEqual(CARD_TARGET);
    });

    it('tapping a different card switches the preview instead of opening a menu', () => {
      const otherTarget: MenuTarget = { kind: 'battlefieldCard', id: 'card-2' };
      render(
        <>
          <CardProbe />
          <CardProbe target={otherTarget} />
        </>,
      );
      tap('probe-card-1', 'touch'); // preview card-1
      tap('probe-card-2', 'touch'); // switch to card-2 (a fresh first tap)
      const preview = useCardPreviewStore.getState();
      expect(preview.isVisible).toBe(true);
      expect(preview.card?.id).toBe('card-2');
      expect(useContextMenuStore.getState().isOpen).toBe(false);
    });

    it('a mouse press on a card surface is ignored (desktop hover/right-click path)', () => {
      render(<CardProbe />);
      tap('probe-card-1', 'mouse');
      expect(useCardPreviewStore.getState().isVisible).toBe(false);
      expect(useContextMenuStore.getState().isOpen).toBe(false);
    });
  });

  describe('menu-first card surface (battlefield: menu → preview)', () => {
    it('first tap opens the menu and shows no preview', () => {
      render(<CardProbe menuFirst />);
      tap('probe-card-1', 'touch');
      const menu = useContextMenuStore.getState();
      expect(menu.isOpen).toBe(true);
      expect(menu.target).toEqual(CARD_TARGET);
      expect(useCardPreviewStore.getState().isVisible).toBe(false);
    });

    it('second tap on the same card swaps the menu for its preview', () => {
      render(<CardProbe menuFirst />);
      tap('probe-card-1', 'touch'); // menu
      tap('probe-card-1', 'touch'); // preview
      expect(useContextMenuStore.getState().isOpen).toBe(false);
      const preview = useCardPreviewStore.getState();
      expect(preview.isVisible).toBe(true);
      expect(preview.card?.id).toBe('card-1');
    });

    it('a third tap goes back to the menu (the two toggle)', () => {
      render(<CardProbe menuFirst />);
      tap('probe-card-1', 'touch'); // menu
      tap('probe-card-1', 'touch'); // preview
      tap('probe-card-1', 'touch'); // menu again
      expect(useContextMenuStore.getState().isOpen).toBe(true);
      expect(useCardPreviewStore.getState().isVisible).toBe(false);
    });

    it('tapping a different card opens THAT card\'s menu (a fresh first tap)', () => {
      const otherTarget: MenuTarget = { kind: 'battlefieldCard', id: 'card-2' };
      render(
        <>
          <CardProbe menuFirst />
          <CardProbe menuFirst target={otherTarget} />
        </>,
      );
      tap('probe-card-1', 'touch'); // card-1's menu
      tap('probe-card-2', 'touch'); // card-2's menu, not card-1's preview
      const menu = useContextMenuStore.getState();
      expect(menu.isOpen).toBe(true);
      expect(menu.target).toEqual(otherTarget);
      expect(useCardPreviewStore.getState().isVisible).toBe(false);
    });

    it('the menu-open check is snapshotted at pointer-down, not read at pointer-up', () => {
      // Radix dismisses the menu on an outside pointer-DOWN, so in the real app
      // the store already reads isOpen:false by pointer-up. Simulate that here —
      // happy-dom has no Radix layer, so without this the test would pass even
      // if the hook (wrongly) read the store at pointer-up. If the snapshot
      // regresses, the second tap re-opens the menu instead of previewing.
      render(<CardProbe menuFirst />);
      tap('probe-card-1', 'touch'); // menu opens
      expect(useContextMenuStore.getState().isOpen).toBe(true);

      const el = screen.getByTestId('probe-card-1');
      fireEvent.pointerDown(el, { pointerType: 'touch', pointerId: 1, clientX: 100, clientY: 100 });
      useContextMenuStore.setState({ isOpen: false }); // Radix's dismiss-on-outside
      fireEvent.pointerUp(el, { pointerType: 'touch', pointerId: 1, clientX: 100, clientY: 100 });

      const preview = useCardPreviewStore.getState();
      expect(preview.isVisible).toBe(true);
      expect(preview.card?.id).toBe('card-1');
      expect(useContextMenuStore.getState().isOpen).toBe(false);
    });
  });
});

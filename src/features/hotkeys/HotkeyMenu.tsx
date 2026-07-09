/**
 * HotkeyMenu
 *
 * TRANSITIONAL — being replaced by `GameContextMenu` (see App.tsx). Every
 * actionable right-click menu has migrated off this component's `menu` mode
 * to the new store-driven `GameContextMenu`; the only remaining callers
 * (`TokenNode`, `KeywordTokenGrid`) use its non-interactive `hint` mode for
 * hover tooltips. Once those get their own context-menu wiring, this
 * component and `hotkeyMenuStore` are deleted outright.
 */

import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { getHotkeysForContext } from './hotkeys';
import { useHotkeyMenuStore } from './hotkeyMenuStore';
import styles from './HotkeyMenu.module.css';

export function HotkeyMenu() {
  const isOpen = useHotkeyMenuStore((s) => s.isOpen);
  const mode = useHotkeyMenuStore((s) => s.mode);
  const x = useHotkeyMenuStore((s) => s.x);
  const y = useHotkeyMenuStore((s) => s.y);
  const context = useHotkeyMenuStore((s) => s.context);
  const cardId = useHotkeyMenuStore((s) => s.cardId);
  const title = useHotkeyMenuStore((s) => s.title);
  const onSelect = useHotkeyMenuStore((s) => s.onSelect);
  const close = useHotkeyMenuStore((s) => s.close);

  const hotkeys = context ? getHotkeysForContext(context) : [];
  const isHint = mode === 'hint';
  const open = isOpen && hotkeys.length > 0;

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={(next) => !next && close()}>
      {/* Zero-size anchor pinned to the cursor position; Radix positions the
          content relative to it with viewport collision avoidance. */}
      <PopoverPrimitive.Anchor
        style={{ position: 'fixed', left: x, top: y, width: 0, height: 0 }}
      />
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="right"
          align="start"
          sideOffset={6}
          collisionPadding={8}
          // Hints must never steal focus or swallow pointer events from the board.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          // Selecting a row must not shift DOM focus off whatever was focused
          // behind it (e.g. a card in an open PileViewer Dialog) — otherwise
          // Radix's focus trap "steals" focus back mid-click and the click
          // that would've landed on this row never fires.
          onMouseDown={(e) => e.preventDefault()}
          className={styles.menu}
          data-hotkey-menu-content
          style={{ pointerEvents: isHint ? 'none' : 'auto' }}
        >
          {title && <div className={styles.title}>{title}</div>}
          {hotkeys.map((hotkey, index) => (
            <div
              key={`${hotkey.action}-${index}`}
              className={`${styles.row} ${isHint ? '' : styles.actionable}`}
              onClick={
                isHint
                  ? undefined
                  : (e) => {
                      e.stopPropagation();
                      if (onSelect && cardId) onSelect(hotkey, cardId);
                      close();
                    }
              }
            >
              <span className={styles.key}>{hotkey.key}</span>
              <span className={styles.action}>{hotkey.shortDescription}</span>
            </div>
          ))}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

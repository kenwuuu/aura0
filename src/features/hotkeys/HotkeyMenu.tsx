/**
 * HotkeyMenu
 *
 * Single app-level Radix Popover that renders the hotkey list for whatever
 * card/token surface most recently opened it (via `useHotkeyMenuStore`).
 * Replaces the imperative `TooltipManager` (manual createRoot + timers +
 * click-outside): Radix handles positioning, collision avoidance, Escape, and
 * outside-click for the actionable `menu` mode. `hint` mode is non-interactive
 * and driven open/closed by the caller's hover handlers.
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
          className={styles.menu}
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

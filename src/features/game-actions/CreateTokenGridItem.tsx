/**
 * CreateTokenGridItem
 *
 * A single `DropdownMenuItem` that, instead of performing an action, opens a
 * sub-popover hosting the drag-to-board keyword/ability token grid
 * (`KeywordTokenGrid`). Shared by every menu that offers "create a token":
 * the desktop `GameActionsToolbar` "Create ▾" dropdown and the empty-board
 * right-click / tap context menu (`GameContextMenu`).
 *
 * Must be rendered inside a Radix `DropdownMenuContent`. It carries no keyboard
 * shortcut — tokens are created by dragging a grid item onto the board.
 */

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { DropdownMenuItem } from '@/shared/ui/dropdown-menu';
import { Popover, PopoverAnchor, PopoverContent } from '@/shared/ui/popover';
import { KeywordTokenGrid } from '@/features/keyword-tokens/KeywordTokenGrid';
import { usePhoneLayout } from '@/shared/hooks';
import { DEFAULT_TOKEN_TEMPLATES } from './defaultTokenTemplates';
import { useTokenTrayStore } from './tokenTrayStore';

export function CreateTokenGridItem({
  label = 'Counter',
  columns = 5,
  align = 'start',
  contentClassName,
}: {
  label?: string;
  columns?: number;
  /** Cross-axis alignment of the popover against the anchoring menu item.
   *  'end' bottom-aligns the grid with the item — used by the board context
   *  menu so the grid's bottom lines up with the (long) menu's bottom edge. */
  align?: 'start' | 'center' | 'end';
  /** Extra classes for the popover surface (e.g. a z-index to match the host
   *  menu). Merged over the base via the shared PopoverContent's cn(). */
  contentClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const isPhone = usePhoneLayout();

  // Phone: no drag (touch can't do HTML5 DnD) and no room for a side popover,
  // so this is a plain menu item that hands off to the bottom-sheet token tray
  // (MobileTokenTray). Let the menu close normally — the tray lives at the app
  // root and survives it.
  if (isPhone) {
    return (
      <DropdownMenuItem onSelect={() => useTokenTrayStore.getState().open()}>
        {label}
      </DropdownMenuItem>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* PopoverAnchor, not PopoverTrigger: we already control `open` explicitly
          via onSelect below. A Trigger would compose its own click->onOpenChange
          handler onto this same DropdownMenuItem, double-toggling `open` (once
          from our onSelect, once from the Trigger's own click handling) and
          netting out to "never opens." Anchor only supplies position, no
          click behavior of its own. */}
      <PopoverAnchor asChild>
        <DropdownMenuItem
          onSelect={(e) => {
            // Prevent the dropdown from closing when the popover opens.
            e.preventDefault();
            setOpen((v) => !v);
          }}
        >
          {label}
          <ChevronDown size={12} style={{ marginLeft: 'auto', opacity: 0.6, transform: open ? 'rotate(180deg)' : undefined }} />
        </DropdownMenuItem>
      </PopoverAnchor>
      <PopoverContent
        side="right"
        align={align}
        className={['p-2 w-auto', contentClassName].filter(Boolean).join(' ')}
        style={{ background: 'rgba(18,18,24,0.98)', border: '1px solid rgba(255,255,255,0.12)' }}
        // The popover's anchor IS a DropdownMenuItem. Radix Menu focuses the
        // item on pointermove; if the popover has grabbed focus on open, that
        // focus-steal reads as "focus left the popover" and the non-modal
        // DismissableLayer dismisses it the instant the user's mouse crosses
        // the item on its way to the grid — the grid vanishes before it can be
        // used. Never take focus on open, and don't treat focus leaving as a
        // dismiss. Outside *clicks* and Escape still close it (pointer/escape
        // paths are untouched).
        onOpenAutoFocus={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
      >
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 6, paddingLeft: 4 }}>
          Drag a counter onto the board
        </p>
        <KeywordTokenGrid templates={DEFAULT_TOKEN_TEMPLATES} columns={columns} gap={8} />
      </PopoverContent>
    </Popover>
  );
}

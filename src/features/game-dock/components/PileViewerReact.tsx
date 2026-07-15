/**
 * PileViewer React Component
 *
 * Full React implementation using shadcn/ui components for:
 * - Modal dialog
 * - Search input with debouncing
 * - Sort select dropdown
 * - Reveal controls with checkbox
 * - Card grid rendering
 * - Keyboard shortcuts
 */

import * as React from 'react';
import { Card, PileType } from '@/features/player';
import { HotkeyContext } from '@/features/hotkeys/hotkeys';
import { YSTATE_DECK_REVEAL_COUNT } from '@/constants';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { CardGrid } from './CardGrid';
import { PileDestinationBar, getAvailableDestinations } from './PileDestinationBar';
import { usePlayerStore } from '@/app/stores/playerStore';
import { useHotkeyStore } from '@/app/stores/hotkeyStore';
import { useContextMenuStore } from '@/features/hotkeys/contextMenuStore';
import { usePileViewerHotkeyStore } from '@/features/game-dock/pileViewerHotkeyStore';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { usePhoneLayout } from '@/shared/hooks';
import { logAction } from '@/features/action-log/actionLog';

export interface PileViewerCallbacks {
  onPlayToBattlefield?: (card: Card) => void;
  onMoveToHand?: (card: Card) => void;
  onMoveToExile?: (card: Card) => void;
  onMoveToDiscard?: (card: Card) => void;
  onMoveToDeckTop?: (card: Card) => void;
  onMoveToDeckBottom?: (card: Card) => void;
  onMoveToSideboard?: (card: Card) => void;
  /** Deck viewer: close the viewer and shuffle the deck. */
  onShuffleDeck?: () => void;
  /** Discard viewer: move all discard cards to exile. */
  onExileAll?: () => void;
}

export interface PileViewerReactProps {
  isOpen: boolean;
  onClose: () => void;
  cards: Card[];
  pileType: PileType;
  callbacks?: PileViewerCallbacks;
}

type SortOrder = 'top-to-bottom' | 'bottom-to-top' | 'alphabetical';

/**
 * The 6 pile-viewer card moves, and the callback each dispatches to. Both the
 * right-click menu and the pile-viewer hotkey layer route through this one
 * table (see `dispatchPileMove`) instead of two mappings that can drift apart.
 */
type PileMoveAction =
  | 'moveToHand'
  | 'moveToDiscard'
  | 'moveToExile'
  | 'moveToDeckTop'
  | 'moveToDeckBottom'
  | 'moveToSideboard';

const PILE_MOVE_CALLBACKS: Record<PileMoveAction, keyof PileViewerCallbacks> = {
  moveToHand: 'onMoveToHand',
  moveToDiscard: 'onMoveToDiscard',
  moveToExile: 'onMoveToExile',
  moveToDeckTop: 'onMoveToDeckTop',
  moveToDeckBottom: 'onMoveToDeckBottom',
  moveToSideboard: 'onMoveToSideboard',
};

function pileTypeToHotkeyContext(pileType: PileType): HotkeyContext {
  switch (pileType) {
    case 'deck': return HotkeyContext.DeckCard;
    case 'discard': return HotkeyContext.Discard;
    case 'exile': return HotkeyContext.Exile;
    case 'scry': return HotkeyContext.Scry;
    case 'sideboard': return HotkeyContext.Sideboard;
    default: return HotkeyContext.DeckCard;
  }
}

type RevealMode = 'none' | 'top' | 'all';

/**
 * The deck reveal control (design 1g): one segmented None / Top [N] / All
 * control, replacing the old checkbox-vs-number-field pair. State still flows
 * through the parent's revealAll/revealCount + Yjs writes — this is chrome only.
 *
 * `showLabel` prepends a non-interactive "REVEAL" chip so the control is
 * self-labelling when it isn't already sitting under a cluster label — used on
 * phone (1a), where it shares a row with the sort dropdown; desktop (1g) keeps
 * its own "Reveal" cluster label and leaves this off.
 */
function RevealSegmented({
  mode,
  count,
  max,
  onMode,
  onCount,
  showLabel = false,
}: {
  mode: RevealMode;
  count: number;
  max: number;
  onMode: (mode: RevealMode) => void;
  onCount: (value: string) => void;
  showLabel?: boolean;
}) {
  return (
    <div className="pile-reveal-segmented" data-testid="reveal-control" role="group" aria-label="Reveal">
      {showLabel && (
        <span className="pile-reveal-seg pile-reveal-seg--label" aria-hidden="true">
          REVEAL
        </span>
      )}
      <button
        type="button"
        className="pile-reveal-seg"
        data-active={mode === 'none'}
        onClick={() => onMode('none')}
      >
        None
      </button>
      <div className="pile-reveal-seg pile-reveal-seg--top" data-active={mode === 'top'}>
        <button type="button" onClick={() => onMode('top')}>Top</button>
        {mode === 'top' && (
          <input
            // type=text (not number) so iOS Safari honors the select-all on
            // focus below; inputMode+pattern still bring up the numeric keypad.
            // The count is clamped to [0, deck size] in handleRevealCountChange.
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={count > 0 ? count : ''}
            placeholder="0"
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => onCount(e.target.value)}
            className="pile-reveal-count reveal-count-input"
            aria-label="Reveal top N cards"
          />
        )}
      </div>
      <button
        type="button"
        className="pile-reveal-seg"
        data-active={mode === 'all'}
        onClick={() => onMode('all')}
      >
        All
      </button>
    </div>
  );
}

export function PileViewerReact({
  isOpen,
  onClose,
  cards,
  pileType,
  callbacks = {},
}: PileViewerReactProps) {
  const yPlayerState = usePlayerStore((state) => state.yPlayerState);
  const setModalOpen = useHotkeyStore((state) => state.setModalOpen);
  const setHoveredPileViewerCard = useHotkeyStore((state) => state.setHoveredPileViewerCard);
  const yDoc = useGameInstance((s) => s.yDoc);
  const playerId = useGameInstance((s) => s.playerId);

  // State
  const [searchQuery, setSearchQuery] = React.useState('');
  const [revealAll, setRevealAll] = React.useState(false);
  const [revealCount, setRevealCount] = React.useState(0);
  const [visibleCardCount, setVisibleCardCount] = React.useState(0);

  const isPhone = usePhoneLayout();

  // Ephemeral UI selection (not shared game state). Tapping/clicking a card
  // toggles it; when non-empty the destination bar rises and the H/D/S/T/Y
  // hotkeys act on the whole batch instead of the single hovered card.
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const clearSelection = React.useCallback(() => setSelectedIds(new Set()), []);
  const toggleSelected = React.useCallback((cardId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }, []);

  // Destinations this viewer can move to — drives the destination bar, the
  // desktop key legend, and whether cards are selectable at all. A read-only
  // viewer (e.g. an opponent's pile) is given no move callbacks, so this is
  // empty and selection is disabled.
  const availableDestinations = getAvailableDestinations(callbacks);
  const selectable = availableDestinations.length > 0;

  const [sortOrder, setSortOrderState] = React.useState<SortOrder>('top-to-bottom');
  // Changing sort order invalidates the previous "reveal top N" indices.
  const setSortOrder = (newSortOrder: SortOrder) => {
    setSortOrderState(newSortOrder);
    setRevealCount(0);
    setRevealAll(false);
  };

  // Refs
  const searchTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  // Debounces the action-log entry (not the Yjs write, which stays immediate)
  // for the "reveal top N" number input, since onChange fires per keystroke.
  const revealCountTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const hotkeyContext = pileTypeToHotkeyContext(pileType);

  // Filter and sort cards
  const filteredAndSortedCards: Card[] = React.useMemo(() => {
    let filtered: Card[] = cards;

    // Filter by search query
    if (searchQuery.trim()) {
      const query: string = searchQuery.toLowerCase().trim();
      filtered = cards.filter((card: Card) => {
        const name: string = card.name?.toLowerCase() || '';
        const typeLine: string = card.type_line?.toLowerCase() || '';
        const cardNumber: string = card.cardNumber.toString();
        const oracleText: string = card.oracleText?.toLowerCase() || '';
        return (
          name.includes(query) ||
          cardNumber.includes(query) ||
          typeLine.includes(query) ||
          oracleText.includes(query)
        );
      });
    }

    // Sort
    if (sortOrder === 'alphabetical') {
      filtered = [...filtered].sort((a, b) => {
        const nameA = a.name?.toLowerCase() || `card${a.cardNumber}`;
        const nameB = b.name?.toLowerCase() || `card${b.cardNumber}`;
        return nameA.localeCompare(nameB);
      });
    } else if (sortOrder === 'top-to-bottom') {
      filtered = [...filtered].reverse();
    } else if (sortOrder === 'bottom-to-top') {
      filtered = [...filtered];
    }

    return filtered;
  }, [cards, searchQuery, sortOrder]);

  // Reflow-safety for hover after a pile-viewer hotkey moves the hovered card
  // out of the grid lives inside CardGrid (it owns the actually-rendered card
  // list; see useReflowSafeHover there) — this just forwards to the store.
  const handleCardHover = (card: Card | null) => {
    if (!card && useContextMenuStore.getState().isOpen) {
      // The right-click that opened the context menu renders it directly
      // over (part of) this card — the browser treats that DOM change as the
      // cursor "leaving" the card and fires a mouseleave even though it never
      // physically moved. Clearing hoverTarget here would break the keyboard
      // hotkeys that read it (hover a card, right-click it, then press a
      // hotkey must still act on that card while its menu is open) — ignore
      // this specific spurious leave; a move to a *different* card still
      // updates hoverTarget normally via the non-null branch below.
      return;
    }
    setHoveredPileViewerCard(card?.id ?? null, card ? hotkeyContext : null);
  };

  // Update hotkey store when modal opens/closes
  React.useEffect(() => {
    setModalOpen(isOpen);
  }, [isOpen, setModalOpen]);

  // Reset state when dialog opens or closes
  React.useEffect(() => {
    setSelectedIds(new Set());
    if (isOpen) {
      setSearchQuery('');
      setSortOrder('top-to-bottom');

      // Initialize reveal state from yPlayerState
      if (pileType === 'deck' && yPlayerState) {
        const deckRevealCount = yPlayerState.get(YSTATE_DECK_REVEAL_COUNT) ?? 0;
        if (deckRevealCount === -1) {
          setRevealAll(true);
          setRevealCount(0);
        } else if (deckRevealCount > 0) {
          setRevealAll(false);
          setRevealCount(deckRevealCount);
        } else {
          setRevealAll(false);
          setRevealCount(0);
        }
      } else {
        setRevealAll(pileType !== 'deck');
        setRevealCount(0);
      }
    } else {
      // Reset state when closing
      setSearchQuery('');
      setSortOrder('top-to-bottom');
      setRevealAll(false);
      setRevealCount(0);

      // Clear deck reveal count in Yjs when closing
      if (pileType === 'deck' && yPlayerState) {
        yPlayerState.set(YSTATE_DECK_REVEAL_COUNT, 0);
      }
    }
  }, [isOpen, pileType, yPlayerState]);

  // Drop selected ids for cards that have left the pile (moved out by a batch
  // action or a hotkey). Search filtering doesn't remove cards from `cards`, so
  // only real moves shrink the selection — keeps the "N selected" count honest.
  React.useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const present = new Set(cards.map((c) => c.id));
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (present.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [cards]);

  // Single source of truth for pile-card moves. Validity is determined entirely
  // by which callback this pile-viewer instance was given — e.g. the deck viewer
  // wires onMoveToDeckTop/onMoveToDeckBottom to reorder within the deck itself,
  // while discard/exile simply don't define a callback for their own pile — so
  // no separate pileType guard is needed here.
  const dispatchPileMove = React.useCallback((action: string, cardId: string) => {
    const callbackKey = PILE_MOVE_CALLBACKS[action as PileMoveAction];
    if (!callbackKey) return;
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;
    (callbacks[callbackKey] as ((card: Card) => void) | undefined)?.(card);
  }, [cards, callbacks]);

  // Batch variant: move every id through the same per-card callback. Each
  // callback reads fresh pile state, so looping synchronously is safe.
  const dispatchPileMoveBatch = React.useCallback((action: string, ids: string[]) => {
    ids.forEach((id) => dispatchPileMove(action, id));
  }, [dispatchPileMove]);

  // A destination-bar tap: move the whole selection, then clear it.
  const handleDestination = React.useCallback((action: string) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    dispatchPileMoveBatch(action, ids);
    clearSelection();
  }, [selectedIds, dispatchPileMoveBatch, clearSelection]);

  // The registered hotkey handler reads selection through a ref so it doesn't
  // re-register on every toggle (and never captures a stale selection).
  const selectedIdsRef = React.useRef(selectedIds);
  React.useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  // Register this viewer's move handler so the global hotkey layer AND the
  // right-click context menu (GameContextMenu, via dispatchGameAction's
  // 'pileViewerCard' case) can route pile-viewer moves to it (replaces the
  // old window 'pileViewerCardAction' bus). When a selection exists, an H/D/S/T/Y
  // press moves the whole batch; otherwise it acts on the single hovered card.
  React.useEffect(() => {
    if (!isOpen) return;

    const handlePileViewerAction = (action: string, cardId: string) => {
      useContextMenuStore.getState().close();
      const selected = selectedIdsRef.current;
      if (selected.size > 0) {
        dispatchPileMoveBatch(action, Array.from(selected));
        clearSelection();
      } else {
        dispatchPileMove(action, cardId);
      }
    };

    usePileViewerHotkeyStore.getState().setActionHandler(handlePileViewerAction);
    return () => usePileViewerHotkeyStore.getState().setActionHandler(null);
  }, [isOpen, dispatchPileMove, dispatchPileMoveBatch, clearSelection]);

  // Debounced search
  const handleSearchChange = (value: string) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setSearchQuery(value);
      setRevealAll(true);
      const trimmed = value.trim();
      if (trimmed && yDoc && playerId) {
        logAction(yDoc, { actorId: playerId, type: 'search', text: `searched ${pileType} for "${trimmed}"` });
      }
    }, 250);
  };

  // Cleanup timeouts on unmount
  React.useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      if (revealCountTimeoutRef.current) {
        clearTimeout(revealCountTimeoutRef.current);
      }
    };
  }, []);

  // Handle reveal all change
  const handleRevealAllChange = (checked: boolean) => {
    setRevealAll(checked);
    if (checked) {
      setRevealCount(0);
      if (yPlayerState) {
        yPlayerState.set(YSTATE_DECK_REVEAL_COUNT, -1);
      }
    } else {
      if (yPlayerState) {
        yPlayerState.set(YSTATE_DECK_REVEAL_COUNT, 0);
      }
    }
    if (yDoc && playerId) {
      logAction(yDoc, {
        actorId: playerId,
        type: 'reveal',
        text: checked ? 'revealed their deck' : 'stopped revealing their deck',
      });
    }
  };

  // Handle reveal count change
  const handleRevealCountChange = (value: string) => {
    const count = parseInt(value) || 0;
    const boundedCount = Math.max(0, Math.min(cards.length, count));
    setRevealCount(boundedCount);
    if (boundedCount > 0) {
      setRevealAll(false);
      if (yPlayerState) {
        yPlayerState.set(YSTATE_DECK_REVEAL_COUNT, boundedCount);
      }
    } else {
      if (yPlayerState) {
        yPlayerState.set(YSTATE_DECK_REVEAL_COUNT, 0);
      }
    }

    if (revealCountTimeoutRef.current) clearTimeout(revealCountTimeoutRef.current);
    revealCountTimeoutRef.current = setTimeout(() => {
      if (!yDoc || !playerId) return;
      logAction(yDoc, {
        actorId: playerId,
        type: 'reveal',
        text: boundedCount > 0
          ? `revealed the top ${boundedCount} card${boundedCount === 1 ? '' : 's'} of their deck`
          : 'stopped revealing the top of their deck',
      });
    }, 1000);
  };

  // Segmented reveal control (1g/1a) — derive the active mode and route each
  // choice through the existing reveal handlers (which own the Yjs writes + logs).
  const revealMode: RevealMode = revealAll ? 'all' : revealCount > 0 ? 'top' : 'none';
  const handleRevealMode = (mode: RevealMode) => {
    if (mode === 'all') {
      handleRevealAllChange(true);
    } else if (mode === 'none') {
      handleRevealAllChange(false);
      setRevealCount(0);
    } else {
      // 'top' — default to revealing the top card if no count is set yet.
      handleRevealCountChange(String(revealCount > 0 ? revealCount : 1));
    }
  };

  // Micro-batch card mounting to prevent blocking the main thread. Opens modal
  // instantly, then progressively renders cards in small batches. Only ramps
  // *up* to the new total — a card leaving the pile (hotkey/drag move) or a
  // search filter narrowing the list must not drop already-mounted cards back
  // to skeletons, which would flicker and (worse) unmount the exact card a
  // reflow-safe hover resync is trying to find.
  React.useEffect(() => {
    if (!isOpen) return;

    const totalCards = filteredAndSortedCards.length;
    const batchSize = 5;
    const batchInterval = 25; // ms between batches

    setVisibleCardCount((prev) => Math.min(prev, totalCards));

    const intervalId = setInterval(() => {
      setVisibleCardCount((prev) => {
        const nextCount = Math.min(prev + batchSize, totalCards);
        if (nextCount >= totalCards) {
          clearInterval(intervalId);
        }
        return nextCount;
      });
    }, batchInterval);

    return () => clearInterval(intervalId);
  }, [isOpen, filteredAndSortedCards.length]);

  // Get dialog title
  const getTitle = () => {
    switch (pileType) {
      case 'deck':
        return 'Search Deck';
      case 'exile':
        return 'Exile Pile';
      case 'discard':
        return 'Discard Pile';
      case 'hand':
        return "Opponent's Hand";
      case 'scry':
        return 'Scry and Surveil';
      default:
        return 'Cards';
    }
  };

  // Deck-only reveal segmented control, shared by both layouts.
  const revealControl = pileType === 'deck' ? (
    <RevealSegmented
      mode={revealMode}
      count={revealCount}
      max={cards.length}
      onMode={handleRevealMode}
      onCount={handleRevealCountChange}
      showLabel={isPhone}
    />
  ) : null;

  // Deck "Close & Shuffle" / discard "Exile All" primary action, shared by both
  // layouts (the destination bar covers per-card moves; this is the pile-level
  // bulk action).
  const primaryAction =
    pileType === 'deck' && callbacks.onShuffleDeck ? (
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          callbacks.onShuffleDeck!();
          onClose();
        }}
      >
        Close &amp; Shuffle
      </Button>
    ) : pileType === 'discard' && callbacks.onExileAll ? (
      <Button variant="outline" size="sm" onClick={() => callbacks.onExileAll!()}>
        Exile All
      </Button>
    ) : null;

  const searchInput = (
    <Input
      type="text"
      placeholder="Search cards..."
      onChange={(e) => handleSearchChange(e.target.value)}
      className="w-full"
    />
  );

  const sortSelect = (
    <Select value={sortOrder} onValueChange={(value: string): void => setSortOrder(value as SortOrder)}>
      <SelectTrigger className="w-[170px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="top-to-bottom">Top to Bottom</SelectItem>
        <SelectItem value="bottom-to-top">Bottom to Top</SelectItem>
        <SelectItem value="alphabetical">Alphabetical</SelectItem>
      </SelectContent>
    </Select>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="deck-pile-viewer-content w-[80vw] h-[70vh] p-0"
        data-testid="pile-viewer"
        data-pile-type={pileType}
        data-phone={isPhone}
        onPointerDownOutside={(e) => {
          // The GameContextMenu renders in a separate React root (App's), so
          // Radix sees clicks on its rows as "outside" this Dialog and would
          // otherwise dismiss it — don't close the modal.
          if (e.target instanceof HTMLElement && e.target.closest('[data-game-context-menu]')) {
            e.preventDefault();
          }
        }}
        onOpenAutoFocus={(e) => {
          // Auto-focusing the search box would hijack keyboard input, so no
          // per-card hotkey would fire until the user clicked something first.
          e.preventDefault();
        }}
      >

        {/* HEADER — phone (1a): pile action + title + count. Desktop (1g): title + key legend. */}
        {isPhone ? (
          <DialogHeader className="pile-header-phone px-5 pt-4 pb-3 border-b">
            {primaryAction && <div className="pile-header-phone-action">{primaryAction}</div>}
            <div className="pile-header-phone-titles">
              <DialogTitle className="text-xl font-bold">{getTitle()}</DialogTitle>
              <div className="deck-pile-viewer-subtitle">{cards.length} CARDS</div>
            </div>
          </DialogHeader>
        ) : (
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <div className="flex items-center justify-between gap-4">
              <DialogTitle className="text-2xl font-bold">{getTitle()}</DialogTitle>
              {selectable && (
                <div className="pile-key-legend" aria-hidden="true">
                  <span className="pile-key-legend-hint">HOVER + KEY →</span>
                  {availableDestinations.map((d) => (
                    <span key={d.key} className="pile-key-chip">
                      <b>{d.key}</b>
                      {d.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </DialogHeader>
        )}

        {/* CONTROLS — phone (1a): stacked. Desktop (1g): Find / Reveal clusters. */}
        {isPhone ? (
          <div className="deck-pile-viewer-controls pile-controls-phone">
            {searchInput}
            {/* Sort + reveal share one row; the pile action moved up into the header. */}
            <div className="pile-controls-phone-row">
              <div className="pile-controls-phone-sort">{sortSelect}</div>
              {revealControl && <div className="pile-controls-phone-reveal">{revealControl}</div>}
            </div>
          </div>
        ) : (
          <div className="deck-pile-viewer-controls pile-controls-desktop">
            <div className="pile-cluster">
              <span className="pile-cluster-label">Find</span>
              <div className="pile-cluster-row">
                <div className="w-[260px]">{searchInput}</div>
                {sortSelect}
              </div>
            </div>
            {revealControl && (
              <>
                <div className="pile-cluster-divider" />
                <div className="pile-cluster">
                  <span className="pile-cluster-label">Reveal</span>
                  {revealControl}
                </div>
              </>
            )}
            <div className="pile-controls-spacer" />
            {primaryAction && <div className="pile-cluster pile-cluster--action">{primaryAction}</div>}
          </div>
        )}

        {/* Card Grid */}
        <div className="deck-pile-viewer-grid-container overflow-auto">
          {filteredAndSortedCards.length === 0 ? (
            <div className="deck-pile-viewer-empty text-center py-12 text-muted-foreground">
              {searchQuery ? 'No cards found' : `No cards in ${pileType}`}
            </div>
          ) : (
            <CardGrid
              cards={filteredAndSortedCards}
              pileType={pileType}
              yPlayerState={yPlayerState}
              visibleCardCount={visibleCardCount}
              revealAll={revealAll}
              revealCount={revealCount}
              onHover={handleCardHover}
              hotkeyContext={hotkeyContext}
              enableReordering={pileType === 'scry'}
              selectable={selectable}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelected}
            />
          )}
        </div>

        {/* Destination bar (1a) — selection-gated; targets flex per pile. */}
        <PileDestinationBar
          selectedCount={selectedIds.size}
          callbacks={callbacks}
          onDestination={handleDestination}
          onClear={clearSelection}
        />
      </DialogContent>
    </Dialog>
  );
}

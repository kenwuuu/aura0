/**
 * DeckPileViewer Component
 *
 * General-purpose pile viewer for deck, exile, and discard piles with:
 * - Card images
 * - Search by card name
 * - Sort by top-to-bottom or alphabetical
 * - Keyboard shortcuts (Z, H, D, S, T, Y)
 *
 * IMPORTANT: Card Order Assumption
 * ================================
 * This component assumes cards are stored in the deck array in BOTTOM-TO-TOP order
 * (i.e., deck[0] = bottom card, deck[deck.length - 1] = top card).
 *
 * Because the app draws cards from the END of the array (via LIFO/pop semantics),
 * we must REVERSE the array to display cards in TOP-TO-BOTTOM order.
 *
 * This reversal happens in two places:
 * 1. show() method (line 49): Initial display reverses the cards
 * 2. filterAndSort() method (line 180): Search/sort operations also reverse for top-to-bottom mode
 *
 * If the deck storage order changes in the future (e.g., switching to top-to-bottom storage),
 * you MUST remove both .reverse() calls to prevent displaying cards in the wrong order.
 */

import { Card } from '../../deck';
import { SearchBar } from './SearchBar';
import { SortControl } from './SortControl';
import { CardGridItem } from './CardGridItem';
import { TooltipManager } from '../../whiteboard/TooltipManager';
import {HotkeyContext, HotkeyDefinition} from '../../../data/hotkeys';

export type PileType = 'deck' | 'exile' | 'discard' | 'hand';

export interface DeckPileViewerCallbacks {
  onPlayToBattlefield?: (card: Card) => void;
  onMoveToHand?: (card: Card) => void;
  onMoveToExile?: (card: Card) => void;
  onMoveToDiscard?: (card: Card) => void;
  onMoveToDeckTop?: (card: Card) => void;
  onMoveToDeckBottom?: (card: Card) => void;
}

export class DeckPileViewer {
  private modal: HTMLElement | null = null;
  private callbacks: DeckPileViewerCallbacks;
  private allCards: Card[] = [];
  private filteredCards: Card[] = [];
  private hoveredCard: Card | null = null;
  private pileType: PileType = 'deck';

  // Components
  private searchBar: SearchBar | null = null;
  private sortControl: SortControl | null = null;
  private gridContainer: HTMLElement | null = null;
  private tooltipManager: TooltipManager | null = null;

  // Current state
  private currentSortOrder: string = 'top-to-bottom';
  private currentSearchQuery: string = '';

  constructor(callbacks: DeckPileViewerCallbacks = {}) {
    this.callbacks = callbacks;
  }

  public show(cards: Card[], pileType: PileType): void {
    this.allCards = cards;
    this.pileType = pileType;
    this.currentSearchQuery = '';
    this.currentSortOrder = 'top-to-bottom';
    this.filteredCards = [...cards].reverse();

    this.modal = this.createModal();
    document.body.appendChild(this.modal);

    // Initialize tooltip manager
    this.setupTooltipManager();

    this.attachGlobalListeners();
    this.renderCards();
  }

  public updateCards(cards: Card[]): void {
    this.allCards = cards;
    this.filterAndSort();
  }

  private createModal(): HTMLElement {
    const modal = document.createElement('div');
    modal.className = 'deck-pile-viewer-modal';

    const content = document.createElement('div');
    content.className = 'deck-pile-viewer-content';

    // Header
    const header = this.createHeader();
    content.appendChild(header);

    // Controls (search + sort)
    const controls = this.createControls();
    content.appendChild(controls);

    // Card grid
    this.gridContainer = document.createElement('div');
    this.gridContainer.className = 'deck-pile-viewer-grid';
    content.appendChild(this.gridContainer);

    modal.appendChild(content);

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.close();
      }
    });

    return modal;
  }

  private createHeader(): HTMLElement {
    const header = document.createElement('div');
    header.className = 'deck-pile-viewer-header';

    const title = document.createElement('h2');

    // Set title based on pile type
    if (this.pileType === 'deck') {
      title.textContent = 'Search Deck';
    } else if (this.pileType === 'exile') {
      title.textContent = 'Exile Pile';
    } else if (this.pileType === 'discard') {
      title.textContent = 'Discard Pile';
    } else if (this.pileType === 'hand') {
      title.textContent = "Opponent's Hand";
    }

    header.appendChild(title);

    // Add subtitle with keyboard shortcuts
    const subtitle = document.createElement('div');
    subtitle.className = 'deck-pile-viewer-subtitle';
    subtitle.textContent = 'Hover card and move to... \nH: Hand • D: Discard • S: Exile • T: Deck Top • Y: Deck Bottom';
    header.appendChild(subtitle);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'deck-pile-viewer-close';
    closeBtn.textContent = '×';
    closeBtn.onclick = () => this.close();

    header.appendChild(closeBtn);

    return header;
  }

  private createControls(): HTMLElement {
    const controls = document.createElement('div');
    controls.className = 'deck-pile-viewer-controls';

    // Search bar
    this.searchBar = new SearchBar({
      placeholder: 'Search by card name...',
      onSearch: (query) => {
        this.currentSearchQuery = query;
        this.filterAndSort();
      },
    });

    // Sort control
    this.sortControl = new SortControl({
      options: [
        { value: 'top-to-bottom', label: 'Top to Bottom' },
        { value: 'bottom-to-top', label: 'Bottom to Top' },
        { value: 'alphabetical', label: 'Alphabetical' },
      ],
      defaultValue: 'top-to-bottom',
      onSortChange: (value) => {
        this.currentSortOrder = value;
        this.filterAndSort();
      },
    });

    controls.appendChild(this.searchBar.getElement());
    controls.appendChild(this.sortControl.getElement());

    return controls;
  }

  private filterAndSort(): void {
    // Filter by search query
    let filtered = this.allCards;

    if (this.currentSearchQuery.trim()) {
      const query = this.currentSearchQuery.toLowerCase().trim();
      filtered = this.allCards.filter((card) => {
        const name = card.name?.toLowerCase() || '';
        const typeLine = card.type_line?.toLowerCase() || '';
        const cardNumber = card.cardNumber.toString();
        return name.includes(query) || cardNumber.includes(query) ||
          typeLine.includes(query);
      });
    }

    // Sort
    if (this.currentSortOrder === 'alphabetical') {
      filtered = [...filtered].sort((a, b) => {
        const nameA = a.name?.toLowerCase() || `card${a.cardNumber}`;
        const nameB = b.name?.toLowerCase() || `card${b.cardNumber}`;
        return nameA.localeCompare(nameB);
      });
    } else if (this.currentSortOrder === 'top-to-bottom') {
      // Deck pile: reverse array to show top cards first (deck is stored as a stack, so fifo,
      // which means we must reverse to get most recent card)
      filtered = [...filtered].reverse();
    } else if (this.currentSortOrder === 'bottom-to-top') {
      filtered = [...filtered];
    }

    this.filteredCards = filtered;
    this.renderCards();
  }

  private renderCards(): void {
    if (!this.gridContainer) return;

    this.gridContainer.innerHTML = '';

    if (this.filteredCards.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'deck-pile-viewer-empty';
      empty.textContent = this.currentSearchQuery
        ? 'No cards found'
        : `No cards in ${this.pileType}`;
      this.gridContainer.appendChild(empty);
      return;
    }

    this.filteredCards.forEach((card) => {
      // Find absolute position in original deck (top to bottom)
      // Deck is stored bottom-to-top, so reverse to get top-to-bottom index
      const absoluteIndex = this.allCards.length - 1 - this.allCards.findIndex(c => c.id === card.id);

      const cardItem = new CardGridItem({
        card,
        position: absoluteIndex,
        showPosition: true, // Always show position
        positionPrefix: 'Top',
        onHover: (card) => {
          this.hoveredCard = card;
          // Focus the card element when hovered to enable immediate hotkey use
          if (card) {
            const cardElement = this.gridContainer?.querySelector(`[data-card-id="${card.id}"]`) as HTMLElement;
            cardElement?.focus();
          }
        },
      });

      const cardElement = cardItem.getElement();
      // Make card focusable for keyboard shortcuts
      cardElement.tabIndex = 0;

      // Attach tooltip events
      this.attachTooltipEvents(cardElement, card);

      this.gridContainer!.appendChild(cardElement);
    });
  }

  /**
   * Setup tooltip manager with hotkey click handler
   */
  private setupTooltipManager(): void {
    this.tooltipManager = new TooltipManager();
    this.tooltipManager.setup((hotkey: HotkeyDefinition, cardId: string) => {
      // Find the card that was clicked
      const card = this.allCards.find(c => c.id === cardId);
      if (!card) return;

      // Map hotkey key to callback action
      const key = hotkey.key.toLowerCase();

      if (key === 'h' && this.callbacks.onMoveToHand) {
        this.callbacks.onMoveToHand(card);
      } else if (key === 'd' && this.callbacks.onMoveToDiscard && this.pileType !== 'discard') {
        this.callbacks.onMoveToDiscard(card);
      } else if (key === 's' && this.callbacks.onMoveToExile && this.pileType !== 'exile') {
        this.callbacks.onMoveToExile(card);
      } else if (key === 't' && this.callbacks.onMoveToDeckTop && this.pileType !== 'deck') {
        this.callbacks.onMoveToDeckTop(card);
      } else if (key === 'y' && this.callbacks.onMoveToDeckBottom && this.pileType !== 'deck') {
        this.callbacks.onMoveToDeckBottom(card);
      }
    });
  }

  /**
   * Attach tooltip hover and click events to a card element
   */
  private attachTooltipEvents(cardElement: HTMLElement, card: Card): void {
    if (!this.tooltipManager) return;

    // Show tooltip on hover (delayed)
    cardElement.addEventListener('mouseenter', (e: MouseEvent) => {
      this.tooltipManager?.showOnHover(card.id, HotkeyContext.Hand, e.clientX, e.clientY);
    });

    // Show tooltip on click (pinned)
    cardElement.addEventListener('click', (e: MouseEvent) => {
      this.tooltipManager?.show(card.id, HotkeyContext.Hand, e.clientX, e.clientY);
    });

    // Hide tooltip on mouse leave
    cardElement.addEventListener('mouseleave', () => {
      this.tooltipManager?.hideOnLeave();
    });
  }

  private attachGlobalListeners(): void {
    const keyHandler = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();

      // Escape always closes
      if (key === 'escape') {
        e.preventDefault();
        this.close();
        return;
      }

      // Don't handle shortcuts if typing in search
      if (e.target instanceof HTMLInputElement) {
        return;
      }

      // All other shortcuts require hovered card
      if (!this.hoveredCard) return;

      // Z - Play to battlefield TODO: implement when we can get them to stop disappearing

      // H - Move to hand
      if (key === 'h' && this.callbacks.onMoveToHand) {
        e.preventDefault();
        this.callbacks.onMoveToHand(this.hoveredCard);
      }

      // D - Move to discard (only if not already in discard)
      if (key === 'd' && this.callbacks.onMoveToDiscard && this.pileType !== 'discard') {
        e.preventDefault();
        this.callbacks.onMoveToDiscard(this.hoveredCard);
      }

      // S - Move to exile (only if not already in exile)
      if (key === 's' && this.callbacks.onMoveToExile && this.pileType !== 'exile') {
        e.preventDefault();
        this.callbacks.onMoveToExile(this.hoveredCard);
      }

      // T - Move to deck top (only if not already in deck)
      if (key === 't' && this.callbacks.onMoveToDeckTop && this.pileType !== 'deck') {
        e.preventDefault();
        this.callbacks.onMoveToDeckTop(this.hoveredCard);
      }

      // Y - Move to deck bottom (only if not already in deck)
      if (key === 'y' && this.callbacks.onMoveToDeckBottom && this.pileType !== 'deck') {
        e.preventDefault();
        this.callbacks.onMoveToDeckBottom(this.hoveredCard);
      }
    };

    document.addEventListener('keydown', keyHandler);

    // Store handler for cleanup
    if (this.modal) {
      (this.modal as any)._keyHandler = keyHandler;
    }
  }

  public close(): void {
    if (this.modal) {
      // Clean up keyboard handler
      const handler = (this.modal as any)._keyHandler;
      if (handler) {
        document.removeEventListener('keydown', handler);
      }

      // Clean up tooltip manager
      if (this.tooltipManager) {
        this.tooltipManager.destroy();
        this.tooltipManager = null;
      }

      if (this.modal.parentElement) {
        this.modal.parentElement.removeChild(this.modal);
      }

      this.modal = null;
      this.searchBar = null;
      this.sortControl = null;
      this.gridContainer = null;
      this.hoveredCard = null;
      this.allCards = [];
      this.filteredCards = [];
    }
  }
}
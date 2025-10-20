/**
 * DeckPileViewer Component
 *
 * Specialized viewer for deck pile with:
 * - Card images
 * - Search by card name
 * - Sort by top-to-bottom or alphabetical
 * - Z and H keyboard shortcuts
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

export type DeckViewMode = 'view' | 'search';

export interface DeckPileViewerCallbacks {
  onPlayToBattlefield?: (card: Card) => void;
  onMoveToHand?: (card: Card) => void;
}

export class DeckPileViewer {
  private modal: HTMLElement | null = null;
  private callbacks: DeckPileViewerCallbacks;
  private allCards: Card[] = [];
  private filteredCards: Card[] = [];
  private hoveredCard: Card | null = null;
  private mode: DeckViewMode = 'view';

  // Components
  private searchBar: SearchBar | null = null;
  private sortControl: SortControl | null = null;
  private gridContainer: HTMLElement | null = null;

  // Current state
  private currentSortOrder: string = 'top-to-bottom';
  private currentSearchQuery: string = '';

  constructor(callbacks: DeckPileViewerCallbacks = {}) {
    this.callbacks = callbacks;
  }

  public show(cards: Card[], mode: DeckViewMode = 'view'): void {
    this.allCards = cards;
    this.mode = mode;
    this.currentSearchQuery = '';
    this.currentSortOrder = 'top-to-bottom';
    this.filteredCards = [...cards].reverse();

    this.modal = this.createModal();
    document.body.appendChild(this.modal);

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
    if (this.mode === 'search') {
      title.textContent = 'Search Deck';

      const subtitle = document.createElement('div');
      subtitle.className = 'deck-pile-viewer-subtitle';
      subtitle.textContent = 'Z: Play to battlefield • H: Move to hand';
      header.appendChild(title);
      header.appendChild(subtitle);
    } else {
      title.textContent = 'Deck';
    }

    if (!header.contains(title)) {
      header.appendChild(title);
    }

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
        const cardNumber = card.cardNumber.toString();
        return name.includes(query) || cardNumber.includes(query);
      });
    }

    // Sort
    if (this.currentSortOrder === 'alphabetical') {
      filtered = [...filtered].sort((a, b) => {
        const nameA = a.name?.toLowerCase() || `card${a.cardNumber}`;
        const nameB = b.name?.toLowerCase() || `card${b.cardNumber}`;
        return nameA.localeCompare(nameB);
      });
    } else {
      // top-to-bottom (reverse array to show top cards first)
      filtered = [...filtered].reverse();
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
        : 'No cards in deck';
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
        onClick: (card) => this.handleCardClick(card),
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
      this.gridContainer!.appendChild(cardElement);
    });
  }

  private handleCardClick(card: Card): void {
    // In search mode, clicking does nothing (use hotkeys)
    // In view mode, clicking closes modal
    if (this.mode === 'view') {
      this.close();
    }
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

      // Z and H shortcuts require hovered card
      if (!this.hoveredCard) return;

      if (key === 'z' && this.callbacks.onPlayToBattlefield) {
        e.preventDefault();
        this.callbacks.onPlayToBattlefield(this.hoveredCard);
        // Don't close modal in search mode
        if (this.mode !== 'search') {
          this.close();
        }
      }

      if (key === 'h' && this.callbacks.onMoveToHand) {
        e.preventDefault();
        this.callbacks.onMoveToHand(this.hoveredCard);
        // Don't close modal in search mode
        if (this.mode !== 'search') {
          this.close();
        }
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
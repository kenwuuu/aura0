import { Player, PlayerState } from '@/features/player';
import { GameResourcesDockConfig } from './types';
import { Card } from '@/features/player';
import { PileViewer, PileType } from './components';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { HotkeyTooltip } from '@/features/hotkeys/HotkeyTooltip';
import { HotkeyContext } from '@/features/hotkeys/hotkeys';
import { useHotkeyStore } from '@/app/stores/hotkeyStore';
import { usePileViewerOpenStore } from './pileViewerOpenStore';
import { useScryStore } from './scryStore';

export class GameResourcesDock {
  private container: HTMLElement;
  private player: Player;
  private config: GameResourcesDockConfig;
  private deckViewer: PileViewer;
  private scryViewer: PileViewer;
  private exileViewer: PileViewer;
  private discardViewer: PileViewer;
  private elements: {
    exile: HTMLElement;
    discard: HTMLElement;
    deck: HTMLElement;
  } | null = null;
  private hoveredResource: 'deck' | 'exile' | 'discard' | null = null;
  private tooltipRoot: Root | null = null;
  private tooltipContainer: HTMLElement | null = null;
  private isModalOpen: boolean = false;
  private currentMouseX: number = 0;
  private currentMouseY: number = 0;
  private isMouseDown: boolean = false;
  private preloadedPiles: Set<'deck' | 'exile' | 'discard'> = new Set();
  private _unsubPileOpen: (() => void) | null = null;
  private _unsubScry: (() => void) | null = null;

  constructor(
    container: HTMLElement,
    player: Player,
    config: GameResourcesDockConfig,
  ) {
    this.container = container;
    this.player = player;
    this.config = config;

    this.deckViewer = new PileViewer({
      onPlayToBattlefield: (card) => this.handlePileViewerCardToBattlefield(card, 'deck'),
      onMoveToHand: (card) => this.handlePileViewerCardToHand(card, 'deck'),
      onMoveToDiscard: (card) => this.handlePileViewerCardToDiscard(card, 'deck'),
      onMoveToExile: (card) => this.handlePileViewerCardToExile(card, 'deck'),
      onMoveToDeckTop: (card) => this.handlePileViewerCardToDeckTop(card, 'deck'),
      onMoveToDeckBottom: (card) => this.handlePileViewerCardToDeckBottom(card, 'deck'),
    });

    // scryViewer is kept here for legacy use; ScryManager handles the new flow.
    this.scryViewer = new PileViewer({
      onMoveToDiscard: (card) => this.handlePileViewerCardToDiscard(card, 'scry'),
      onMoveToDeckTop: (card) => this.handlePileViewerCardToDeckTop(card, 'scry'),
      onMoveToDeckBottom: (card) => this.handlePileViewerCardToDeckBottom(card, 'scry'),
    });

    this.exileViewer = new PileViewer({
      onPlayToBattlefield: (card) => this.handlePileViewerCardToBattlefield(card, 'exile'),
      onMoveToHand: (card) => this.handlePileViewerCardToHand(card, 'exile'),
      onMoveToDiscard: (card) => this.handlePileViewerCardToDiscard(card, 'exile'),
      onMoveToDeckTop: (card) => this.handlePileViewerCardToDeckTop(card, 'exile'),
      onMoveToDeckBottom: (card) => this.handlePileViewerCardToDeckBottom(card, 'exile'),
    });

    this.discardViewer = new PileViewer({
      onPlayToBattlefield: (card) => this.handlePileViewerCardToBattlefield(card, 'discard'),
      onMoveToHand: (card) => this.handlePileViewerCardToHand(card, 'discard'),
      onMoveToExile: (card) => this.handlePileViewerCardToExile(card, 'discard'),
      onMoveToDeckTop: (card) => this.handlePileViewerCardToDeckTop(card, 'discard'),
      onMoveToDeckBottom: (card) => this.handlePileViewerCardToDeckBottom(card, 'discard'),
    });

    this.render();
    this.setupEventListeners();
    this.setupDragDropZones();
    this.setupTooltip();

    this._unsubPileOpen = usePileViewerOpenStore.subscribe((state) => {
      const req = state.request;
      if (!req || req.scope !== 'local') return;
      usePileViewerOpenStore.getState().clear();
      this.viewPile(req.pile);
    });

    // ScryManager (mounted in App.tsx) handles the modal + viewer. The dock's
    // scryViewer is kept for backwards compat but ScryManager bypasses it.
    this._unsubScry = useScryStore.subscribe((state) => {
      if (!state.requested) return;
      // ScryManager consumes the request; nothing to do here.
    });
  }

  private setupTooltip(): void {
    this.tooltipContainer = document.createElement('div');
    this.tooltipContainer.className = 'hotkey-tooltip-container';
    document.body.appendChild(this.tooltipContainer);
    this.tooltipRoot = createRoot(this.tooltipContainer);

    document.addEventListener('mousemove', (e: MouseEvent) => {
      this.currentMouseX = e.clientX;
      this.currentMouseY = e.clientY;
      this.updateHotkeyTooltip();
    });

    document.addEventListener('mousedown', () => {
      this.isMouseDown = true;
      this.updateHotkeyTooltip();
    });

    document.addEventListener('mouseup', () => {
      this.isMouseDown = false;
      this.updateHotkeyTooltip();
    });
  }

  private updateHotkeyTooltip(): void {
    if (!this.tooltipRoot) return;

    if (this.isModalOpen) {
      this.tooltipRoot.render(null);
      return;
    }

    if (this.hoveredResource) {
      this.tooltipRoot.render(
        React.createElement(HotkeyTooltip, {
          context: this.hoveredResource as HotkeyContext,
          mouseX: this.currentMouseX,
          mouseY: this.currentMouseY,
          isMouseDown: this.isMouseDown,
        })
      );
    } else {
      this.tooltipRoot.render(null);
    }
  }

  private render(): void {
    this.container.className = `game-resources-dock ${this.config.position}`;

    const exile = this.createPileElement('exile', 'Exile');
    const discard = this.createPileElement('discard', 'Discard');
    const deck = this.createDeckElement();

    this.container.appendChild(exile);
    this.container.appendChild(discard);
    this.container.appendChild(deck);

    this.elements = { exile, discard, deck };
  }

  private createPileElement(type: string, label: string): HTMLElement {
    const pile = document.createElement('div');
    pile.className = `resource-pile ${type}-pile`;
    pile.dataset.pileType = type;

    const labelEl = document.createElement('div');
    labelEl.className = 'pile-label';
    labelEl.textContent = label;

    const count = document.createElement('div');
    count.className = 'pile-count';
    count.dataset.pile = type;
    count.textContent = '0';

    pile.appendChild(labelEl);
    pile.appendChild(count);

    pile.addEventListener('mouseenter', () => {
      this.hoveredResource = type as 'deck' | 'exile' | 'discard';
      if (type === 'deck' || type === 'exile' || type === 'discard') {
        useHotkeyStore.getState().setHoveredPile(type);
      }
      this.updateHotkeyTooltip();
      this.preloadPileImages(type as 'deck' | 'exile' | 'discard');
    });

    pile.addEventListener('mouseleave', () => {
      this.hoveredResource = null;
      if (type === 'deck' || type === 'exile' || type === 'discard') {
        useHotkeyStore.getState().setHoveredPile(null);
      }
      this.updateHotkeyTooltip();
    });

    pile.onclick = () => this.viewPile(type as 'exile' | 'discard');

    return pile;
  }

  private createDeckElement(): HTMLElement {
    const deck = document.createElement('div');
    deck.className = 'resource-pile deck-pile';
    deck.dataset.pileType = 'deck';

    const labelEl = document.createElement('div');
    labelEl.className = 'pile-label';
    labelEl.textContent = 'Deck';

    const count = document.createElement('div');
    count.className = 'pile-count';
    count.dataset.pile = 'deck';
    count.textContent = '60';

    const drawButton = document.createElement('button');
    drawButton.className = 'draw-button';
    drawButton.textContent = 'Draw';
    drawButton.onclick = (e) => {
      e.stopPropagation();
      this.player.drawCard();
    };

    deck.appendChild(labelEl);
    deck.appendChild(count);
    deck.appendChild(drawButton);

    deck.addEventListener('mouseenter', () => {
      this.hoveredResource = 'deck';
      useHotkeyStore.getState().setHoveredPile('deck');
    });

    deck.addEventListener('mouseleave', () => {
      this.hoveredResource = null;
      useHotkeyStore.getState().setHoveredPile(null);
    });

    deck.onclick = (e) => {
      if (e.target !== drawButton) {
        this.viewPile('deck');
      }
    };

    return deck;
  }

  private setupEventListeners(): void {
    this.player.onStateChange((state) => {
      this.updateUI(state);
    });

    window.addEventListener('modalOpen', () => {
      this.isModalOpen = true;
      this.updateHotkeyTooltip();
    });

    window.addEventListener('modalClosed', () => {
      this.isModalOpen = false;
      this.updateHotkeyTooltip();
    });

    this.updateUI(this.player.getState());
  }

  private setupDragDropZones(): void {
    if (!this.elements) return;

    [this.elements.exile, this.elements.discard, this.elements.deck].forEach((pile) => {
      pile.addEventListener('dragover', (e) => {
        e.preventDefault();
        pile.classList.add('drag-over');
      });

      pile.addEventListener('dragleave', () => {
        pile.classList.remove('drag-over');
      });

      pile.addEventListener('drop', (e) => {
        e.preventDefault();
        pile.classList.remove('drag-over');

        const cardId = e.dataTransfer?.getData('text/plain');
        if (!cardId) return;

        const card = this.player.getState().hand.find((c) => c.id === cardId);
        if (!card) return;

        function isPileType(value: string): value is PileType {
          return ['deck', 'exile', 'discard', 'hand', 'scry'].includes(value);
        }

        const pileType = pile.dataset.pileType;
        if (pileType && isPileType(pileType)) {
          this.player.removeCardFromHand(cardId);
          this.player.placeCardInPile(card, pileType);
        }
      });
    });
  }

  private updateUI(state: PlayerState): void {
    if (!this.elements) return;

    const exileCount = this.elements.exile.querySelector('.pile-count');
    if (exileCount) exileCount.textContent = state.exilePile.length.toString();

    const discardCount = this.elements.discard.querySelector('.pile-count');
    if (discardCount) discardCount.textContent = state.discardPile.length.toString();

    const deckCount = this.elements.deck.querySelector('.pile-count');
    if (deckCount) deckCount.textContent = state.deck.length.toString();
  }

  private viewPile(pileType: 'exile' | 'discard' | 'deck'): void {
    let cards;
    let pileViewer;
    switch (pileType) {
      case "deck":
        cards = this.player.getDeck().getCards();
        pileViewer = this.deckViewer;
        break;
      case "discard":
        cards = this.player.getDiscardPile().getCards();
        pileViewer = this.discardViewer;
        break;
      case "exile":
        cards = this.player.getExilePile().getCards();
        pileViewer = this.exileViewer;
        break;
    }

    pileViewer.show(cards, pileType);
  }

  private handlePileViewerCardToBattlefield(card: Card, pileType: 'deck' | 'exile' | 'discard'): void {
    this.player.removeCardFromPileById(card.id, pileType);

    const event = new CustomEvent('playCard', {
      detail: { card, playerId: this.player.getId() }
    });
    window.dispatchEvent(event);

    this.updatePileViewer(pileType);
  }

  private handlePileViewerCardToHand(card: Card, pileType: 'deck' | 'exile' | 'discard'): void {
    this.player.removeCardFromPileById(card.id, pileType)
    this.player.placeCardInPile(card, 'hand');
    this.updatePileViewer(pileType);
  }

  private handlePileViewerCardToExile(card: Card, pileType: 'discard' | 'deck'): void {
    this.player.removeCardFromPileById(card.id, pileType)
    this.player.placeCardInPile(card, 'exile');
    this.updatePileViewer(pileType);
  }

  private handlePileViewerCardToDiscard(card: Card, pileType: 'exile' | 'deck' | 'scry'): void {
    this.player.removeCardFromPileById(card.id, pileType)
    this.player.placeCardInPile(card, 'discard');
    this.updatePileViewer(pileType);
  }

  private handlePileViewerCardToDeckTop(card: Card, pileType: 'exile' | 'discard' | 'deck' | 'scry'): void {
    this.player.removeCardFromPileById(card.id, pileType)
    this.player.placeCardInPile(card, 'deck');
    this.updatePileViewer(pileType);
  }

  private handlePileViewerCardToDeckBottom(card: Card, pileType: 'exile' | 'discard' | 'deck' | 'scry'): void {
    this.player.removeCardFromPileById(card.id, pileType)
    this.player.placeCardInPile(card, 'deck', 0);
    this.updatePileViewer(pileType);
  }

  private updatePileViewer(pileType: 'deck' | 'exile' | 'discard' | 'scry'): void {
    if (pileType === 'deck') {
      this.deckViewer.updateCards(this.player.getDeckCards());
    } else if (pileType === 'exile') {
      this.exileViewer.updateCards(this.player.getState().exilePile);
    } else if (pileType === 'discard') {
      this.discardViewer.updateCards(this.player.getState().discardPile);
    } else if (pileType === 'scry') {
      this.scryViewer.updateCards(this.player.getScryPile().getCards());
    }
  }

  private preloadPileImages(pileType: 'deck' | 'exile' | 'discard'): void {
    if (this.preloadedPiles.has(pileType)) return;
    this.preloadedPiles.add(pileType);

    let cards: Card[] = [];
    if (pileType === 'deck') {
      cards = this.player.getDeckCards();
    } else {
      const state = this.player.getState();
      cards = pileType === 'exile' ? state.exilePile : state.discardPile;
    }

    cards.forEach(card => {
      const imageUrl = card.images?.front?.normal || card.images?.front?.small;
      if (imageUrl) {
        const img = new Image();
        img.src = imageUrl;
      }
    });
  }

  public destroy(): void {
    if (this._unsubPileOpen) {
      this._unsubPileOpen();
      this._unsubPileOpen = null;
    }
    if (this._unsubScry) {
      this._unsubScry();
      this._unsubScry = null;
    }
    if (this.tooltipRoot) {
      this.tooltipRoot.unmount();
      this.tooltipRoot = null;
    }
    if (this.tooltipContainer) {
      this.tooltipContainer.remove();
      this.tooltipContainer = null;
    }
    if (this.elements) {
      this.container.innerHTML = '';
      this.elements = null;
    }
    this.scryViewer.close();
    this.deckViewer.close();
    this.exileViewer.close();
    this.discardViewer.close();
  }
}

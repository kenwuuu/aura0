import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { CardPreview } from './CardPreview';
import { Card } from '../deck/types';

/**
 * TEMPORARY WRAPPER: Imperative bridge to CardPreview React component.
 *
 * This wrapper provides backward-compatible API for vanilla JS classes
 * (Whiteboard.ts, GameResourcesDock.ts) that haven't been migrated to React yet.
 *
 * TODO: Remove this wrapper when all consuming classes are rewritten in React.
 * When Whiteboard and GameResourcesDock become React components, they should:
 * 1. Import CardPreview directly from './CardPreview'
 * 2. Manage hover state with useState
 * 3. Render <CardPreview card={hoveredCard} isVisible={!!hoveredCard} />
 */
export class CardPreviewWrapper {
  private root: Root | null = null;
  private container: HTMLElement | null = null;
  private currentCard: Card | null = null;
  private isVisible: boolean = false;

  constructor() {
    this.createContainer();
  }

  private createContainer(): void {
    this.container = document.createElement('div');
    this.container.id = 'card-preview-root';
    document.body.appendChild(this.container);
    this.root = createRoot(this.container);
    this.render();
  }

  private render(): void {
    if (!this.root) return;

    this.root.render(
      React.createElement(CardPreview, {
        card: this.currentCard,
        isVisible: this.isVisible,
      })
    );
  }

  public show(card: Card, mouseEvent?: MouseEvent): void {
    if (!card.images?.front?.normal) return; // Only show if card has image

    this.currentCard = card;
    this.isVisible = true;
    this.render();
  }

  public updatePosition(mouseEvent: MouseEvent): void {
    // No-op: Preview is fixed to top right corner
    // Method kept for backward compatibility
  }

  public hide(): void {
    this.isVisible = false;
    this.currentCard = null;
    this.render();
  }

  public destroy(): void {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }
}
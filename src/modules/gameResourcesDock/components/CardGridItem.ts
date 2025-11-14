/**
 * CardGridItem Component
 *
 * Reusable card display with image and fallback to card number
 */

import { Card } from '../../deck';
import { DEFAULT_CARD_BACK } from '../../../constants';

export interface CardGridItemConfig {
  card: Card;
  position?: number;
  showPosition?: boolean;
  positionPrefix?: string;
  showFaceDown?: boolean;
  onClick?: (card: Card) => void;
  onHover?: (card: Card | null) => void;
}

export class CardGridItem {
  private element: HTMLElement;
  private config: CardGridItemConfig;

  constructor(config: CardGridItemConfig) {
    this.config = config;
    this.element = this.createElement();
    this.attachListeners();
  }

  private createElement(): HTMLElement {
    const { card, position, showPosition, positionPrefix, showFaceDown } = this.config;

    const container = document.createElement('div');
    container.className = 'card-grid-item';
    container.dataset.cardId = card.id;

    // Card image or placeholder
    const imageContainer = document.createElement('div');
    imageContainer.className = 'card-grid-item-image';

    // Determine which image to show (back if face down, front otherwise)
    const imageUrl = showFaceDown
      ? (DEFAULT_CARD_BACK)
      : (card.images?.front?.normal || card.images?.front?.small);

    if (imageUrl) {
      const img = document.createElement('img');
      img.src = imageUrl;
      img.alt = showFaceDown ? 'Card Back' : (card.name || `Card #${card.cardNumber}`);
      img.className = 'card-grid-item-img';

      // Add loading state
      img.addEventListener('load', () => {
        imageContainer.classList.add('loaded');
      });

      img.addEventListener('error', () => {
        // Fallback to card number on image load error
        imageContainer.innerHTML = '';
        const fallback = document.createElement('div');
        fallback.className = 'card-grid-item-fallback';
        fallback.textContent = `#${card.cardNumber}`;
        imageContainer.appendChild(fallback);
      });

      imageContainer.appendChild(img);
    } else {
      // No image available - show card number
      const fallback = document.createElement('div');
      fallback.className = 'card-grid-item-fallback';
      fallback.textContent = `#${card.cardNumber}`;
      imageContainer.appendChild(fallback);
    }

    container.appendChild(imageContainer);

    // Card name (if available and not face down)
    if (card.name && !showFaceDown) {
      const name = document.createElement('div');
      name.className = 'card-grid-item-name';
      name.textContent = card.name;
      container.appendChild(name);
    }

    // Position label (optional)
    if (showPosition && position !== undefined) {
      const positionLabel = document.createElement('div');
      positionLabel.className = 'card-grid-item-position';
      positionLabel.textContent = positionPrefix
        ? `${positionPrefix} ${position + 1}`
        : `${position + 1}`;
      container.appendChild(positionLabel);
    }

    return container;
  }

  private attachListeners(): void {
    const { card, onClick, onHover } = this.config;

    if (onClick) {
      this.element.style.cursor = 'pointer';
      this.element.addEventListener('click', () => onClick(card));
    }

    if (onHover) {
      this.element.addEventListener('mouseenter', () => onHover(card));
      this.element.addEventListener('mouseleave', () => onHover(null));
    }
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public getCard(): Card {
    return this.config.card;
  }
}
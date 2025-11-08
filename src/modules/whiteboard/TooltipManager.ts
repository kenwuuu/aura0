import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { HotkeyTooltip } from '../../components';
import { HotkeyContext } from '../../data/hotkeys';

/**
 * Manages hotkey tooltip display for the battlefield
 */
export class TooltipManager {
  private tooltipRoot: Root | null = null;
  private tooltipContainer: HTMLElement | null = null;
  private currentMouseX: number = 0;
  private currentMouseY: number = 0;
  private mouseMoveHandler: ((e: MouseEvent) => void) | null = null;

  /**
   * Initialize tooltip container and event listeners
   */
  setup(): void {
    // Create tooltip container
    this.tooltipContainer = document.createElement('div');
    this.tooltipContainer.className = 'hotkey-tooltip-container-battlefield';
    document.body.appendChild(this.tooltipContainer);
    this.tooltipRoot = createRoot(this.tooltipContainer);

    // Setup mouse move listener to track cursor position
    this.mouseMoveHandler = (e: MouseEvent) => {
      this.currentMouseX = e.clientX;
      this.currentMouseY = e.clientY;
    };
    document.addEventListener('mousemove', this.mouseMoveHandler);
  }

  /**
   * Update tooltip display based on hover state
   * @param isCardHovered - Whether a battlefield card is currently hovered
   */
  update(isCardHovered: boolean): void {
    if (!this.tooltipRoot) return;

    if (isCardHovered) {
      this.tooltipRoot.render(
        React.createElement(HotkeyTooltip, {
          context: 'battlefield' as HotkeyContext,
          mouseX: this.currentMouseX,
          mouseY: this.currentMouseY,
        })
      );
    } else {
      this.tooltipRoot.render(null);
    }
  }

  /**
   * Clean up tooltip resources
   */
  destroy(): void {
    if (this.tooltipRoot) {
      this.tooltipRoot.unmount();
      this.tooltipRoot = null;
    }
    if (this.tooltipContainer) {
      this.tooltipContainer.remove();
      this.tooltipContainer = null;
    }
    if (this.mouseMoveHandler) {
      document.removeEventListener('mousemove', this.mouseMoveHandler);
      this.mouseMoveHandler = null;
    }
  }
}
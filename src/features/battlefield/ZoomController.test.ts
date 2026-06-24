import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ZoomController } from './ZoomController';
import { CARD_WIDTH, CARD_HEIGHT } from '../../constants';

describe('ZoomController', () => {
  let controller: ZoomController;

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    // Clear DOM
    document.body.innerHTML = '';
    controller = new ZoomController();
  });

  afterEach(() => {
    controller.destroy();
  });

  describe('Constructor', () => {
    it('should initialize with default zoom level of 1', () => {
      expect(controller.getZoomLevel()).toBe(1);
    });

    it('should load zoom level from localStorage if available', () => {
      localStorage.setItem('whiteboard-zoom', '1.5');
      const newController = new ZoomController();

      expect(newController.getZoomLevel()).toBe(1.5);
      newController.destroy();
    });

    it('should handle invalid localStorage value gracefully', () => {
      localStorage.setItem('whiteboard-zoom', 'invalid');
      const newController = new ZoomController();

      expect(isNaN(newController.getZoomLevel())).toBe(true);
      newController.destroy();
    });

    it('should not create UI elements in constructor', () => {
      const controls = document.querySelector('.zoom-controls');
      expect(controls).toBeNull();
    });
  });

  describe('getZoomLevel()', () => {
    it('should return current zoom level', () => {
      controller.setZoom(1.5);
      expect(controller.getZoomLevel()).toBe(1.5);
    });

    it('should return initial zoom level before any changes', () => {
      expect(controller.getZoomLevel()).toBe(1);
    });
  });

  describe('setupControls()', () => {
    it('should create zoom controls in DOM', () => {
      controller.setupControls();

      const controls = document.querySelector('.zoom-controls');
      expect(controls).toBeTruthy();
    });

    it('should create three buttons (zoom in, reset, zoom out)', () => {
      controller.setupControls();

      const buttons = document.querySelectorAll('.zoom-button');
      expect(buttons.length).toBe(3);
    });

    it('should position controls fixed at bottom-right', () => {
      controller.setupControls();

      const controls = document.querySelector('.zoom-controls') as HTMLElement;
      expect(controls.style.position).toBe('fixed');
      expect(controls.style.bottom).toBe('200px');
      expect(controls.style.right).toBe('20px');
    });

    it('should display current zoom level on reset button', () => {
      controller.setupControls();

      const displayBtn = document.querySelector('.zoom-display');
      expect(displayBtn?.textContent).toBe('1.0×');
    });

    it('should display custom zoom level if loaded from localStorage', () => {
      localStorage.setItem('whiteboard-zoom', '1.5');
      const newController = new ZoomController();
      newController.setupControls();

      const displayBtn = document.querySelector('.zoom-display');
      expect(displayBtn?.textContent).toBe('1.5×');
      newController.destroy();
    });

    it('should trigger initial callback with current zoom level', () => {
      const callback = vi.fn();
      controller.onZoomChange(callback);

      controller.setupControls();

      expect(callback).toHaveBeenCalledWith(1);
    });

    it('should set high z-index for controls', () => {
      controller.setupControls();

      const controls = document.querySelector('.zoom-controls') as HTMLElement;
      expect(controls.style.zIndex).toBe('1000');
    });
  });

  describe('setZoom()', () => {
    it('should update zoom level', () => {
      controller.setZoom(1.5);
      expect(controller.getZoomLevel()).toBe(1.5);
    });

    it('should save zoom level to localStorage', () => {
      controller.setZoom(2.0);
      expect(localStorage.getItem('whiteboard-zoom')).toBe('2');
    });

    it('should update display button text', () => {
      controller.setupControls();

      controller.setZoom(2.5);

      const displayBtn = document.querySelector('.zoom-display');
      expect(displayBtn?.textContent).toBe('2.5×');
    });

    it('should notify registered callbacks', () => {
      const callback = vi.fn();
      controller.onZoomChange(callback);

      controller.setZoom(1.8);

      expect(callback).toHaveBeenCalledWith(1.8);
    });

    it('should notify multiple callbacks', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();

      controller.onZoomChange(callback1);
      controller.onZoomChange(callback2);
      controller.onZoomChange(callback3);

      controller.setZoom(1.5);

      expect(callback1).toHaveBeenCalledWith(1.5);
      expect(callback2).toHaveBeenCalledWith(1.5);
      expect(callback3).toHaveBeenCalledWith(1.5);
    });

    it('should handle decimal zoom levels', () => {
      controller.setZoom(1.234);
      expect(controller.getZoomLevel()).toBe(1.234);
    });

    it('should format display to 1 decimal place', () => {
      controller.setupControls();

      controller.setZoom(1.234);

      const displayBtn = document.querySelector('.zoom-display');
      expect(displayBtn?.textContent).toBe('1.2×');
    });
  });

  describe('Zoom buttons', () => {
    beforeEach(() => {
      controller.setupControls();
    });

    it('should zoom in by 0.1 when clicking + button', () => {
      const zoomInBtn = Array.from(document.querySelectorAll('.zoom-button'))
        .find(btn => btn.textContent === '+') as HTMLButtonElement;

      zoomInBtn.click();

      expect(controller.getZoomLevel()).toBe(1.1);
    });

    it('should zoom out by 0.1 when clicking − button', () => {
      const zoomOutBtn = Array.from(document.querySelectorAll('.zoom-button'))
        .find(btn => btn.textContent === '−') as HTMLButtonElement;

      zoomOutBtn.click();

      expect(controller.getZoomLevel()).toBe(0.9);
    });

    it('should reset to 1.0 when clicking display button', () => {
      controller.setZoom(1.5);
      const resetBtn = document.querySelector('.zoom-display') as HTMLButtonElement;

      resetBtn.click();

      expect(controller.getZoomLevel()).toBe(1);
    });

    it('should have proper titles on buttons', () => {
      const buttons = document.querySelectorAll('.zoom-button');
      const zoomInBtn = Array.from(buttons).find(btn => btn.textContent === '+') as HTMLElement;
      const zoomOutBtn = Array.from(buttons).find(btn => btn.textContent === '−') as HTMLElement;
      const resetBtn = document.querySelector('.zoom-display') as HTMLElement;

      expect(zoomInBtn.title).toBe('Zoom In Cards');
      expect(zoomOutBtn.title).toBe('Zoom Out Cards');
      expect(resetBtn.title).toBe('Reset Zoom');
    });
  });

  describe('Zoom limits', () => {
    beforeEach(() => {
      controller.setupControls();
    });

    it('should not zoom below 0.5', () => {
      controller.setZoom(0.5);
      const zoomOutBtn = Array.from(document.querySelectorAll('.zoom-button'))
        .find(btn => btn.textContent === '−') as HTMLButtonElement;

      zoomOutBtn.click();

      expect(controller.getZoomLevel()).toBe(0.5); // Should remain at minimum
    });

    it('should not zoom above 2.5', () => {
      controller.setZoom(2.5);
      const zoomInBtn = Array.from(document.querySelectorAll('.zoom-button'))
        .find(btn => btn.textContent === '+') as HTMLButtonElement;

      zoomInBtn.click();

      expect(controller.getZoomLevel()).toBe(2.5); // Should remain at maximum
    });

    it('should allow zoom at exactly 0.5', () => {
      controller.setZoom(0.5);
      expect(controller.getZoomLevel()).toBe(0.5);
    });

    it('should allow zoom at exactly 2.5', () => {
      controller.setZoom(2.5);
      expect(controller.getZoomLevel()).toBe(2.5);
    });

    it('should clamp values below minimum to 0.5', () => {
      controller.setZoom(0.6);
      const zoomOutBtn = Array.from(document.querySelectorAll('.zoom-button'))
        .find(btn => btn.textContent === '−') as HTMLButtonElement;

      // Click twice (should go 0.6 -> 0.5 -> 0.5)
      zoomOutBtn.click();
      zoomOutBtn.click();

      expect(controller.getZoomLevel()).toBe(0.5);
    });

    it('should clamp values above maximum to 2.5', () => {
      controller.setZoom(2.4);
      const zoomInBtn = Array.from(document.querySelectorAll('.zoom-button'))
        .find(btn => btn.textContent === '+') as HTMLButtonElement;

      // Click twice (should go 2.4 -> 2.5 -> 2.5)
      zoomInBtn.click();
      zoomInBtn.click();

      expect(controller.getZoomLevel()).toBe(2.5);
    });
  });

  describe('applyZoomToCard()', () => {
    it('should set card width based on zoom level', () => {
      const cardElement = document.createElement('div');
      controller.setZoom(1.5);

      controller.applyZoomToCard(cardElement);

      const expectedWidth = CARD_WIDTH * 1.5;
      expect(cardElement.style.width).toBe(`${expectedWidth}px`);
    });

    it('should set card height based on zoom level', () => {
      const cardElement = document.createElement('div');
      controller.setZoom(1.5);

      controller.applyZoomToCard(cardElement);

      const expectedHeight = CARD_HEIGHT * 1.5;
      expect(cardElement.style.height).toBe(`${expectedHeight}px`);
    });

    it('should apply default zoom (1.0) correctly', () => {
      const cardElement = document.createElement('div');

      controller.applyZoomToCard(cardElement);

      expect(cardElement.style.width).toBe(`${CARD_WIDTH}px`);
      expect(cardElement.style.height).toBe(`${CARD_HEIGHT}px`);
    });

    it('should apply zoom < 1 correctly', () => {
      const cardElement = document.createElement('div');
      controller.setZoom(0.5);

      controller.applyZoomToCard(cardElement);

      expect(cardElement.style.width).toBe(`${CARD_WIDTH * 0.5}px`);
      expect(cardElement.style.height).toBe(`${CARD_HEIGHT * 0.5}px`);
    });

    it('should apply zoom > 1 correctly', () => {
      const cardElement = document.createElement('div');
      controller.setZoom(2.5);

      controller.applyZoomToCard(cardElement);

      expect(cardElement.style.width).toBe(`${CARD_WIDTH * 2.5}px`);
      expect(cardElement.style.height).toBe(`${CARD_HEIGHT * 2.5}px`);
    });

    it('should work with multiple card elements', () => {
      const card1 = document.createElement('div');
      const card2 = document.createElement('div');
      const card3 = document.createElement('div');
      controller.setZoom(1.8);

      controller.applyZoomToCard(card1);
      controller.applyZoomToCard(card2);
      controller.applyZoomToCard(card3);

      const expectedWidth = `${CARD_WIDTH * 1.8}px`;
      const expectedHeight = `${CARD_HEIGHT * 1.8}px`;

      expect(card1.style.width).toBe(expectedWidth);
      expect(card2.style.width).toBe(expectedWidth);
      expect(card3.style.width).toBe(expectedWidth);
      expect(card1.style.height).toBe(expectedHeight);
      expect(card2.style.height).toBe(expectedHeight);
      expect(card3.style.height).toBe(expectedHeight);
    });
  });

  describe('onZoomChange()', () => {
    it('should register callback successfully', () => {
      const callback = vi.fn();

      controller.onZoomChange(callback);
      controller.setZoom(1.5);

      expect(callback).toHaveBeenCalledWith(1.5);
    });

    it('should allow registering multiple callbacks', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      controller.onZoomChange(callback1);
      controller.onZoomChange(callback2);

      controller.setZoom(2.0);

      expect(callback1).toHaveBeenCalledWith(2.0);
      expect(callback2).toHaveBeenCalledWith(2.0);
    });

    it('should call callbacks in registration order', () => {
      const callOrder: number[] = [];
      const callback1 = vi.fn(() => callOrder.push(1));
      const callback2 = vi.fn(() => callOrder.push(2));
      const callback3 = vi.fn(() => callOrder.push(3));

      controller.onZoomChange(callback1);
      controller.onZoomChange(callback2);
      controller.onZoomChange(callback3);

      controller.setZoom(1.5);

      expect(callOrder).toEqual([1, 2, 3]);
    });

    it('should call callback on every zoom change', () => {
      const callback = vi.fn();
      controller.onZoomChange(callback);

      controller.setZoom(1.2);
      controller.setZoom(1.5);
      controller.setZoom(2.0);

      expect(callback).toHaveBeenCalledTimes(3);
      expect(callback).toHaveBeenNthCalledWith(1, 1.2);
      expect(callback).toHaveBeenNthCalledWith(2, 1.5);
      expect(callback).toHaveBeenNthCalledWith(3, 2.0);
    });

    it('should trigger callback on setupControls', () => {
      const callback = vi.fn();
      controller.onZoomChange(callback);

      controller.setupControls();

      expect(callback).toHaveBeenCalledWith(1); // Initial zoom
    });
  });

  describe('destroy()', () => {
    it('should remove zoom controls from DOM', () => {
      controller.setupControls();
      const controls = document.querySelector('.zoom-controls');
      expect(controls).toBeTruthy();

      controller.destroy();

      const removedControls = document.querySelector('.zoom-controls');
      expect(removedControls).toBeNull();
    });

    it('should clear all callbacks', () => {
      const callback = vi.fn();
      controller.onZoomChange(callback);

      controller.destroy();
      controller.setZoom(1.5);

      expect(callback).not.toHaveBeenCalledWith(1.5);
    });

    it('should handle destroy without setupControls', () => {
      expect(() => {
        controller.destroy();
      }).not.toThrow();
    });

    it('should handle multiple destroy calls', () => {
      controller.setupControls();

      expect(() => {
        controller.destroy();
        controller.destroy();
        controller.destroy();
      }).not.toThrow();
    });

    it('should preserve zoom level after destroy', () => {
      controller.setZoom(1.7);
      controller.destroy();

      expect(controller.getZoomLevel()).toBe(1.7);
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete lifecycle', () => {
      const callback = vi.fn();

      controller.onZoomChange(callback);
      controller.setupControls();
      expect(callback).toHaveBeenCalledWith(1);

      const zoomInBtn = Array.from(document.querySelectorAll('.zoom-button'))
        .find(btn => btn.textContent === '+') as HTMLButtonElement;
      zoomInBtn.click();

      expect(controller.getZoomLevel()).toBe(1.1);
      expect(callback).toHaveBeenCalledWith(1.1);

      controller.destroy();
      const controls = document.querySelector('.zoom-controls');
      expect(controls).toBeNull();
    });

    it('should persist zoom across controller instances', () => {
      controller.setZoom(1.8);
      controller.destroy();

      const newController = new ZoomController();
      expect(newController.getZoomLevel()).toBe(1.8);
      newController.destroy();
    });

    it('should update card sizes when zoom changes', () => {
      const card = document.createElement('div');
      const callback = vi.fn(() => {
        controller.applyZoomToCard(card);
      });

      controller.onZoomChange(callback);
      controller.setupControls();

      const zoomInBtn = Array.from(document.querySelectorAll('.zoom-button'))
        .find(btn => btn.textContent === '+') as HTMLButtonElement;

      zoomInBtn.click(); // Zoom to 1.1

      // Parse the actual numbers from the style to avoid string precision issues
      const actualWidth = parseFloat(card.style.width);
      const actualHeight = parseFloat(card.style.height);
      const expectedWidth = CARD_WIDTH * 1.1;
      const expectedHeight = CARD_HEIGHT * 1.1;

      expect(actualWidth).toBeCloseTo(expectedWidth, 10);
      expect(actualHeight).toBeCloseTo(expectedHeight, 10);
    });

    it('should handle rapid zoom changes', () => {
      controller.setupControls();
      const zoomInBtn = Array.from(document.querySelectorAll('.zoom-button'))
        .find(btn => btn.textContent === '+') as HTMLButtonElement;

      // Rapid clicks
      for (let i = 0; i < 5; i++) {
        zoomInBtn.click();
      }

      // Use toBeCloseTo to handle floating point precision (1 + 0.1 * 5 might not be exactly 1.5)
      expect(controller.getZoomLevel()).toBeCloseTo(1.5, 10);
    });

    it('should synchronize display with actual zoom level', () => {
      controller.setupControls();
      controller.setZoom(2.3);

      const displayBtn = document.querySelector('.zoom-display');
      expect(displayBtn?.textContent).toBe('2.3×');
      expect(controller.getZoomLevel()).toBe(2.3);
    });
  });

  describe('localStorage integration', () => {
    it('should persist zoom level across page reloads', () => {
      controller.setZoom(1.9);
      expect(localStorage.getItem('whiteboard-zoom')).toBe('1.9');

      // Simulate page reload
      const newController = new ZoomController();
      expect(newController.getZoomLevel()).toBe(1.9);
      newController.destroy();
    });

    it('should update localStorage on every zoom change', () => {
      controller.setZoom(1.0);
      expect(localStorage.getItem('whiteboard-zoom')).toBe('1');

      controller.setZoom(1.5);
      expect(localStorage.getItem('whiteboard-zoom')).toBe('1.5');

      controller.setZoom(2.0);
      expect(localStorage.getItem('whiteboard-zoom')).toBe('2');
    });

    it('should handle corrupted localStorage gracefully', () => {
      localStorage.setItem('whiteboard-zoom', 'not-a-number');

      const newController = new ZoomController();
      // Should not crash, though value might be NaN
      expect(() => newController.getZoomLevel()).not.toThrow();
      newController.destroy();
    });
  });
});
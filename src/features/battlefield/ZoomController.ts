import { CARD_WIDTH, CARD_HEIGHT } from '../../constants';

/**
 * Manages zoom level and UI controls for the whiteboard
 */
export class ZoomController {
  private zoomLevel: number = 1;
  private zoomControls: HTMLElement | null = null;
  private zoomChangeCallbacks: Array<(zoom: number) => void> = [];

  constructor() {
    // Load zoom level from localStorage
    this.zoomLevel = parseFloat(localStorage.getItem('whiteboard-zoom') || '1');
  }

  /**
   * Get the current zoom level
   */
  getZoomLevel(): number {
    return this.zoomLevel;
  }

  /**
   * Setup zoom control UI buttons and trigger initial callback
   */
  setupControls(): void {
    const controls = document.createElement('div');
    controls.className = 'zoom-controls';
    controls.style.position = 'fixed';
    controls.style.bottom = '200px';
    controls.style.right = '20px';
    controls.style.zIndex = '1000';
    controls.style.display = 'flex';
    controls.style.flexDirection = 'column';
    controls.style.gap = '8px';

    const zoomInBtn = document.createElement('button');
    zoomInBtn.className = 'zoom-button';
    zoomInBtn.textContent = '+';
    zoomInBtn.title = 'Zoom In Cards';
    zoomInBtn.onclick = () => this.adjustZoom(0.1);

    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.className = 'zoom-button';
    zoomOutBtn.textContent = '−';
    zoomOutBtn.title = 'Zoom Out Cards';
    zoomOutBtn.onclick = () => this.adjustZoom(-0.1);

    const resetBtn = document.createElement('button');
    resetBtn.className = 'zoom-button zoom-display';
    resetBtn.textContent = `${this.zoomLevel.toFixed(1)}×`;
    resetBtn.title = 'Reset Zoom';
    resetBtn.onclick = () => this.setZoom(1);

    controls.appendChild(zoomInBtn);
    controls.appendChild(resetBtn);
    controls.appendChild(zoomOutBtn);

    document.body.appendChild(controls);
    this.zoomControls = controls;

    // Trigger initial callback with current zoom level (e.g., if loaded from localStorage)
    this.notifyZoomChange();
  }

  /**
   * Adjust zoom by a delta amount
   * @param delta - Amount to adjust zoom (positive or negative)
   */
  private adjustZoom(delta: number): void {
    const newZoom = Math.max(0.5, Math.min(2.5, this.zoomLevel + delta));
    this.setZoom(newZoom);
  }

  /**
   * Set zoom to a specific level
   * @param zoom - The zoom level to set (0.5 to 2.5)
   */
  setZoom(zoom: number): void {
    this.zoomLevel = zoom;
    localStorage.setItem('whiteboard-zoom', zoom.toString());

    // Update the display button text
    if (this.zoomControls) {
      const displayBtn = this.zoomControls.querySelector('.zoom-display');
      if (displayBtn) {
        displayBtn.textContent = `${this.zoomLevel.toFixed(1)}×`;
      }
    }

    // Notify all listeners
    this.notifyZoomChange();
  }

  /**
   * Apply zoom to a card element
   * @param cardElement - The card DOM element to resize
   */
  applyZoomToCard(cardElement: HTMLElement): void {
    const width = CARD_WIDTH * this.zoomLevel;
    const height = CARD_HEIGHT * this.zoomLevel;

    cardElement.style.width = `${width}px`;
    cardElement.style.height = `${height}px`;
  }

  /**
   * Register a callback to be called when zoom changes
   * @param callback - Function to call with new zoom level
   */
  onZoomChange(callback: (zoom: number) => void): void {
    this.zoomChangeCallbacks.push(callback);
  }

  /**
   * Notify all registered callbacks of zoom change
   */
  private notifyZoomChange(): void {
    this.zoomChangeCallbacks.forEach(callback => callback(this.zoomLevel));
  }

  /**
   * Clean up zoom controls
   */
  destroy(): void {
    if (this.zoomControls) {
      this.zoomControls.remove();
      this.zoomControls = null;
    }
    this.zoomChangeCallbacks = [];
  }
}
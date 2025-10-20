/**
 * SearchBar Component
 *
 * Reusable search input with live filtering
 */

export interface SearchBarConfig {
  placeholder?: string;
  onSearch: (query: string) => void;
  debounceMs?: number;
}

export class SearchBar {
  private element: HTMLElement;
  private input: HTMLInputElement;
  private config: SearchBarConfig;
  private debounceTimer: number | null = null;

  constructor(config: SearchBarConfig) {
    this.config = {
      placeholder: 'Search cards...',
      debounceMs: 150,
      ...config,
    };

    this.element = this.createElement();
    this.input = this.element.querySelector('input')!;
    this.attachListeners();
  }

  private createElement(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'search-bar';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'search-bar-input';
    input.placeholder = this.config.placeholder!;

    const icon = document.createElement('span');
    icon.className = 'search-bar-icon';
    icon.textContent = '🔍';

    container.appendChild(icon);
    container.appendChild(input);

    return container;
  }

  private attachListeners(): void {
    this.input.addEventListener('input', (e) => {
      const query = (e.target as HTMLInputElement).value;

      // Debounce search
      if (this.debounceTimer !== null) {
        clearTimeout(this.debounceTimer);
      }

      this.debounceTimer = window.setTimeout(() => {
        this.config.onSearch(query);
        this.debounceTimer = null;
      }, this.config.debounceMs);
    });
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public focus(): void {
    this.input.focus();
  }

  public clear(): void {
    this.input.value = '';
    this.config.onSearch('');
  }

  public getValue(): string {
    return this.input.value;
  }
}
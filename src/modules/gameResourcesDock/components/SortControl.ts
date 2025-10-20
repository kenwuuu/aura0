/**
 * SortControl Component
 *
 * Reusable dropdown for sorting options
 */

export type SortOption = {
  value: string;
  label: string;
};

export interface SortControlConfig {
  options: SortOption[];
  defaultValue?: string;
  onSortChange: (value: string) => void;
}

export class SortControl {
  private element: HTMLElement;
  private select: HTMLSelectElement;
  private config: SortControlConfig;

  constructor(config: SortControlConfig) {
    this.config = config;
    this.element = this.createElement();
    this.select = this.element.querySelector('select')!;
    this.attachListeners();
  }

  private createElement(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'sort-control';

    const label = document.createElement('label');
    label.className = 'sort-control-label';
    label.textContent = 'Sort:';

    const select = document.createElement('select');
    select.className = 'sort-control-select';

    this.config.options.forEach((option) => {
      const optionEl = document.createElement('option');
      optionEl.value = option.value;
      optionEl.textContent = option.label;

      if (option.value === this.config.defaultValue) {
        optionEl.selected = true;
      }

      select.appendChild(optionEl);
    });

    container.appendChild(label);
    container.appendChild(select);

    return container;
  }

  private attachListeners(): void {
    this.select.addEventListener('change', (e) => {
      const value = (e.target as HTMLSelectElement).value;
      this.config.onSortChange(value);
    });
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public getValue(): string {
    return this.select.value;
  }

  public setValue(value: string): void {
    this.select.value = value;
    this.config.onSortChange(value);
  }
}
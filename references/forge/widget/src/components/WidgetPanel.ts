import type { WidgetView } from '../lib/types';

export class WidgetPanel {
  private panel: HTMLElement;
  private body: HTMLElement;
  private tabs: Map<WidgetView, HTMLButtonElement> = new Map();
  private onViewChange: (view: WidgetView) => void;
  private onClose: () => void;
  private destroyed = false;

  constructor(
    container: HTMLElement,
    position: string,
    onViewChange: (view: WidgetView) => void,
    onClose: () => void,
  ) {
    this.onViewChange = onViewChange;
    this.onClose = onClose;

    this.panel = document.createElement('div');
    this.panel.className = `forge-panel forge-panel--${position}`;

    // Header
    const header = document.createElement('div');
    header.className = 'forge-panel__header';

    const tabsDiv = document.createElement('div');
    tabsDiv.className = 'forge-panel__tabs';

    const views: { view: WidgetView; label: string }[] = [
      { view: 'form', label: 'Report' },
      { view: 'status', label: 'Status' },
      { view: 'chat', label: 'Chat' },
    ];
    for (const { view, label } of views) {
      const btn = document.createElement('button');
      btn.className = 'forge-panel__tab';
      btn.textContent = label;
      btn.addEventListener('click', () => this.onViewChange(view));
      this.tabs.set(view, btn);
      tabsDiv.appendChild(btn);
    }
    header.appendChild(tabsDiv);

    const close = document.createElement('button');
    close.className = 'forge-close';
    close.textContent = '\u00d7';
    close.addEventListener('click', this.onClose);
    header.appendChild(close);

    this.panel.appendChild(header);

    // Body
    this.body = document.createElement('div');
    this.body.className = 'forge-panel__body';
    this.panel.appendChild(this.body);

    container.appendChild(this.panel);
  }

  setActiveTab(view: WidgetView): void {
    this.tabs.forEach((btn, v) => {
      btn.classList.toggle('forge-panel__tab--active', v === view);
    });
  }

  getBody(): HTMLElement {
    return this.body;
  }

  clearBody(): void {
    this.body.innerHTML = '';
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.panel.remove();
  }
}

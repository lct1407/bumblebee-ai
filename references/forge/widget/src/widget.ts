import type { WidgetConfig, WidgetView, Issue } from './lib/types';
import { DEFAULT_THEME } from './lib/types';
import { ForgeAPI } from './lib/api';
import { ForgeWebSocket } from './lib/websocket';
import { createShadowContainer, injectStyles } from './utils/shadow-dom';
import { WidgetButton } from './components/WidgetButton';
import { WidgetPanel } from './components/WidgetPanel';
import { IssueForm } from './components/IssueForm';
import { IssueStatus } from './components/IssueStatus';
import { ChatPanel } from './components/ChatPanel';
import widgetCSS from './styles/widget.css?inline';

export class Widget {
  private config: Required<
    Pick<WidgetConfig, 'apiKey' | 'apiUrl' | 'position'>
  > &
    WidgetConfig;
  private api: ForgeAPI;
  private ws: ForgeWebSocket;
  private shadow!: ShadowRoot;
  private container!: HTMLDivElement;
  private button!: WidgetButton;
  private panel: WidgetPanel | null = null;
  private currentView: WidgetView = 'form';
  private currentIssue: Issue | null = null;
  private isOpen = false;

  // Active view component refs for cleanup
  private activeComponent: { destroy(): void } | null = null;

  constructor(config: WidgetConfig) {
    this.config = {
      ...config,
      position: config.position ?? 'bottom-right',
    };
    this.api = new ForgeAPI(config.apiUrl, config.apiKey);
    this.ws = new ForgeWebSocket(config.apiUrl, config.apiKey);
  }

  mount(): void {
    const { shadow, container } = createShadowContainer('forge-widget-host');
    this.shadow = shadow;
    this.container = container;

    // Apply theme as CSS variables
    const theme = { ...DEFAULT_THEME, ...this.config.theme };
    container.style.setProperty('--forge-primary-color', theme.primaryColor);
    container.style.setProperty('--forge-text-color', theme.textColor);
    container.style.setProperty('--forge-bg-color', theme.backgroundColor);
    container.style.setProperty('--forge-border-radius', theme.borderRadius);
    container.style.setProperty('--forge-font-family', theme.fontFamily);

    injectStyles(shadow, widgetCSS);

    this.button = new WidgetButton(
      container,
      this.config.position,
      () => this.toggle(),
    );

    this.ws.connect();
  }

  private toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  private open(): void {
    if (this.isOpen) return;
    this.isOpen = true;

    this.panel = new WidgetPanel(
      this.container,
      this.config.position,
      (view) => this.switchView(view),
      () => this.close(),
    );

    this.switchView(this.currentIssue ? 'status' : 'form');
  }

  private close(): void {
    this.activeComponent?.destroy();
    this.activeComponent = null;
    this.panel?.destroy();
    this.panel = null;
    this.isOpen = false;
  }

  private switchView(view: WidgetView): void {
    if (!this.panel) return;
    this.currentView = view;
    this.activeComponent?.destroy();
    this.activeComponent = null;
    this.panel.clearBody();
    this.panel.setActiveTab(view);

    const body = this.panel.getBody();

    switch (view) {
      case 'form':
        this.activeComponent = new IssueForm(
          body,
          this.api,
          (issue) => {
            this.currentIssue = issue;
            this.switchView('status');
          },
          this.config.defaultFields ?? {},
        );
        break;

      case 'status':
        if (this.currentIssue) {
          this.activeComponent = new IssueStatus(
            body,
            this.api,
            this.ws,
            this.currentIssue,
            () => {
              this.currentIssue = null;
              this.switchView('form');
            },
          );
        } else {
          body.innerHTML =
            '<p style="color:#9ca3af;text-align:center">No issue submitted yet.</p>';
        }
        break;

      case 'chat':
        this.activeComponent = new ChatPanel(body);
        break;
    }
  }

  destroy(): void {
    this.close();
    this.button?.destroy();
    this.ws.disconnect();
    const host = document.getElementById('forge-widget-host');
    host?.remove();
  }
}

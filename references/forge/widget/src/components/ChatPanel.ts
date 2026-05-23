export class ChatPanel {
  private container: HTMLElement;

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div');
    this.container.className = 'forge-chat';
    this.container.textContent = 'Chat coming soon...';
    parent.appendChild(this.container);
  }

  destroy(): void {
    this.container.remove();
  }
}

export class WidgetButton {
  private button: HTMLButtonElement;
  private badge: HTMLSpanElement;
  private _unreadCount = 0;

  constructor(container: HTMLElement, position: string, onClick: () => void) {
    this.button = document.createElement('button');
    this.button.className = `forge-btn forge-btn--${position}`;
    this.button.setAttribute('aria-label', 'Report an issue');
    this.button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z"/></svg>`;
    this.button.addEventListener('click', onClick);

    this.badge = document.createElement('span');
    this.badge.className = 'forge-btn__badge';
    this.badge.style.display = 'none';
    this.button.appendChild(this.badge);

    container.appendChild(this.button);
  }

  set unreadCount(count: number) {
    this._unreadCount = count;
    if (count > 0) {
      this.badge.textContent = count > 99 ? '99+' : String(count);
      this.badge.style.display = 'flex';
    } else {
      this.badge.style.display = 'none';
    }
  }

  get unreadCount(): number {
    return this._unreadCount;
  }

  destroy(): void {
    this.button.remove();
  }
}

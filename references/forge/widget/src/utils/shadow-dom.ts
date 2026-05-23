export function createShadowContainer(hostId: string): {
  host: HTMLElement;
  shadow: ShadowRoot;
  container: HTMLDivElement;
} {
  const host = document.createElement('div');
  host.id = hostId;
  host.style.all = 'initial';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  const container = document.createElement('div');
  container.id = 'forge-widget-root';
  shadow.appendChild(container);

  return { host, shadow, container };
}

export function injectStyles(shadow: ShadowRoot, css: string): void {
  const style = document.createElement('style');
  style.textContent = css;
  shadow.prepend(style);
}

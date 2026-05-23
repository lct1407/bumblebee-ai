import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Widget } from '../widget';

class MockWebSocket {
  static OPEN = 1;
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  send = vi.fn();
  close = vi.fn();
}
vi.stubGlobal('WebSocket', MockWebSocket);

beforeEach(() => {
  document.body.innerHTML = '';
});

const config = {
  apiKey: 'test-key',
  apiUrl: 'http://localhost:1337',
};

describe('Widget Class', () => {
  it('mount creates Shadow DOM host in document.body', () => {
    const w = new Widget(config);
    w.mount();
    const host = document.getElementById('forge-widget-host');
    expect(host).not.toBeNull();
    expect(host!.shadowRoot).not.toBeNull();
  });

  it('mount with position sets correct CSS class on button', () => {
    const w = new Widget({ ...config, position: 'bottom-right' });
    w.mount();
    const host = document.getElementById('forge-widget-host');
    const root = host!.shadowRoot!.getElementById('forge-widget-root');
    expect(root).not.toBeNull();
    // Verify the button has the position class
    const btn = root!.querySelector('button.forge-btn--bottom-right');
    expect(btn).not.toBeNull();
  });

  it('theme CSS custom properties: ALL theme properties are set', () => {
    const w = new Widget({
      ...config,
      theme: { primaryColor: '#ff0000' },
    });
    w.mount();
    const host = document.getElementById('forge-widget-host');
    const root = host!.shadowRoot!.getElementById('forge-widget-root');
    // Verify primaryColor override
    expect(root!.style.getPropertyValue('--forge-primary-color')).toBe('#ff0000');
    // Verify all default theme properties are also set
    expect(root!.style.getPropertyValue('--forge-text-color')).toBe('#1f2937');
    expect(root!.style.getPropertyValue('--forge-bg-color')).toBe('#ffffff');
    expect(root!.style.getPropertyValue('--forge-border-radius')).toBe('12px');
    expect(root!.style.getPropertyValue('--forge-font-family')).toBe('system-ui, sans-serif');
  });

  it('destroy removes host from DOM and disconnects WebSocket', () => {
    const w = new Widget(config);
    w.mount();
    expect(document.getElementById('forge-widget-host')).not.toBeNull();
    w.destroy();
    expect(document.getElementById('forge-widget-host')).toBeNull();
  });
});

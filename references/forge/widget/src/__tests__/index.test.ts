import { describe, it, expect, beforeEach, vi } from 'vitest';

// We need to reset module state between tests since ForgeWidget has a module-level `instance`
let ForgeWidget: typeof import('../index').ForgeWidget;

beforeEach(async () => {
  document.body.innerHTML = '';
  vi.resetModules();
  const mod = await import('../index');
  ForgeWidget = mod.ForgeWidget;
});

const validConfig = {
  apiKey: 'test-key',
  apiUrl: 'http://localhost:1337',
};

// Mock WebSocket globally
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

describe('ForgeWidget.init()', () => {
  it('creates widget, mounts to document with button and shadow root structure', () => {
    const instance = ForgeWidget.init(validConfig);
    expect(instance).toBeDefined();
    const host = document.getElementById('forge-widget-host');
    expect(host).not.toBeNull();
    // Verify shadow root contains widget structure
    const shadow = host!.shadowRoot!;
    const root = shadow.getElementById('forge-widget-root');
    expect(root).not.toBeNull();
    // Verify button element exists inside shadow root
    expect(root!.querySelector('button')).not.toBeNull();
  });

  it('throws descriptive error when apiKey is missing', () => {
    expect(() => ForgeWidget.init({ apiUrl: 'http://localhost' } as any)).toThrow(
      'apiKey',
    );
  });

  it('throws descriptive error when apiUrl is missing', () => {
    expect(() => ForgeWidget.init({ apiKey: 'key' } as any)).toThrow('apiUrl');
  });

  it('warns and returns existing instance on double init', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const first = ForgeWidget.init(validConfig);
    const second = ForgeWidget.init(validConfig);
    expect(second).toBe(first);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Already initialized'));
    warn.mockRestore();
  });

  it('destroy() removes from DOM and cleans up', () => {
    ForgeWidget.init(validConfig);
    expect(document.getElementById('forge-widget-host')).not.toBeNull();
    ForgeWidget.destroy();
    expect(document.getElementById('forge-widget-host')).toBeNull();
  });
});

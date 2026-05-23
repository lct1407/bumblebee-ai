import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForgeWebSocket } from '../websocket';

let instances: any[] = [];

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  url: string;
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  send = vi.fn();
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    instances.push(this);
  }
}

vi.stubGlobal('WebSocket', MockWebSocket);

beforeEach(() => {
  instances = [];
  vi.useFakeTimers();
});

describe('WebSocket', () => {
  it('connect creates WS without API key in URL', () => {
    const ws = new ForgeWebSocket('http://localhost:1337', 'secret-key');
    ws.connect();
    expect(instances.length).toBe(1);
    expect(instances[0].url).not.toContain('secret-key');
    expect(instances[0].url).toContain('/ws');
  });

  it('connect sends auth message on open with apiKey', () => {
    const ws = new ForgeWebSocket('http://localhost:1337', 'secret-key');
    ws.connect();
    const mock = instances[0];
    mock.readyState = MockWebSocket.OPEN;
    mock.onopen!();
    expect(mock.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'auth', apiKey: 'secret-key' }),
    );
  });

  it('reconnect delay resets on successful connection', () => {
    const ws = new ForgeWebSocket('http://localhost:1337', 'key');
    ws.connect();

    // First close without open -> delay starts at 1000, scheduleReconnect doubles to 2000
    instances[0].onclose!();
    vi.advanceTimersByTime(1000);
    expect(instances.length).toBe(2); // reconnected after 1s

    // Second close without open -> delay is now 2000, doubled to 4000
    instances[1].onclose!();
    vi.advanceTimersByTime(2000);
    expect(instances.length).toBe(3); // reconnected after 2s

    // Now simulate successful open -> resets delay to 1000
    const mock = instances[2];
    mock.readyState = MockWebSocket.OPEN;
    mock.onopen!();

    // Simulate close (readyState must change so connect() doesn't bail)
    mock.readyState = MockWebSocket.CLOSED;
    mock.onclose!();
    // delay was reset to 1000 by onopen, so reconnect fires at 1000ms
    vi.advanceTimersByTime(1000);
    expect(instances.length).toBe(4);
  });

  it('exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s, 30s capped', () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const ws = new ForgeWebSocket('http://localhost:1337', 'key');
    ws.connect();

    // Track actual setTimeout delay values
    const delays: number[] = [];

    // 1s
    instances[0].onclose!();
    delays.push(setTimeoutSpy.mock.calls[setTimeoutSpy.mock.calls.length - 1][1] as number);
    vi.advanceTimersByTime(1000);
    expect(instances.length).toBe(2);

    // 2s
    instances[1].onclose!();
    delays.push(setTimeoutSpy.mock.calls[setTimeoutSpy.mock.calls.length - 1][1] as number);
    vi.advanceTimersByTime(2000);
    expect(instances.length).toBe(3);

    // 4s
    instances[2].onclose!();
    delays.push(setTimeoutSpy.mock.calls[setTimeoutSpy.mock.calls.length - 1][1] as number);
    vi.advanceTimersByTime(4000);
    expect(instances.length).toBe(4);

    // 8s
    instances[3].onclose!();
    delays.push(setTimeoutSpy.mock.calls[setTimeoutSpy.mock.calls.length - 1][1] as number);
    vi.advanceTimersByTime(8000);
    expect(instances.length).toBe(5);

    // 16s
    instances[4].onclose!();
    delays.push(setTimeoutSpy.mock.calls[setTimeoutSpy.mock.calls.length - 1][1] as number);
    vi.advanceTimersByTime(16000);
    expect(instances.length).toBe(6);

    // 30s (capped from 32s)
    instances[5].onclose!();
    delays.push(setTimeoutSpy.mock.calls[setTimeoutSpy.mock.calls.length - 1][1] as number);
    vi.advanceTimersByTime(30000);
    expect(instances.length).toBe(7);

    // Verify actual delay values: 1s, 2s, 4s, 8s, 16s, 30s
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 30000]);

    setTimeoutSpy.mockRestore();
  });

  it('on/off registers and unregisters handlers', () => {
    const ws = new ForgeWebSocket('http://localhost:1337', 'key');
    ws.connect();
    const handler = vi.fn();
    ws.on('test', handler);
    const mock = instances[0];
    mock.onmessage!({ data: JSON.stringify({ type: 'test', data: { foo: 1 } }) });
    expect(handler).toHaveBeenCalledWith({ foo: 1 });

    ws.off('test', handler);
    mock.onmessage!({ data: JSON.stringify({ type: 'test', data: { foo: 2 } }) });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('message parsing: valid JSON dispatches to correct handler', () => {
    const ws = new ForgeWebSocket('http://localhost:1337', 'key');
    ws.connect();
    const h1 = vi.fn();
    const h2 = vi.fn();
    ws.on('a', h1);
    ws.on('b', h2);
    instances[0].onmessage!({ data: JSON.stringify({ type: 'a', data: 'x' }) });
    expect(h1).toHaveBeenCalledWith('x');
    expect(h2).not.toHaveBeenCalled();
  });

  it('malformed JSON: handler is NOT called for malformed data', () => {
    const ws = new ForgeWebSocket('http://localhost:1337', 'key');
    ws.connect();
    const handler = vi.fn();
    ws.on('test', handler);

    // Send malformed JSON - should not crash and handler should not be called
    expect(() => {
      instances[0].onmessage!({ data: 'not json{{{' });
    }).not.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });

  it('disconnect closes socket and stops reconnection', () => {
    const ws = new ForgeWebSocket('http://localhost:1337', 'key');
    ws.connect();
    ws.disconnect();
    expect(instances[0].close).toHaveBeenCalled();
  });
});

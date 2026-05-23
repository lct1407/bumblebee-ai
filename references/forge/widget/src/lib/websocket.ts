type MessageHandler = (data: unknown) => void;

export class ForgeWebSocket {
  private ws: WebSocket | null = null;
  private apiUrl: string;
  private apiKey: string;
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;

  constructor(apiUrl: string, apiKey: string) {
    this.apiUrl = apiUrl.replace(/^http/, 'ws').replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    try {
      this.ws = new WebSocket(`${this.apiUrl}/ws`);

      this.ws.onopen = () => {
        this.ws?.send(JSON.stringify({ type: 'auth', apiKey: this.apiKey }));
        this.reconnectDelay = 1000;
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const type = msg.type as string;
          this.handlers.get(type)?.forEach((fn) => fn(msg.data));
        } catch {
          // ignore malformed messages
        }
      };

      this.ws.onclose = () => this.scheduleReconnect();
      this.ws.onerror = (e) => {
        console.warn('[ForgeWebSocket] Connection error:', e);
        this.ws?.close();
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
      this.connect();
    }, this.reconnectDelay);
  }

  on(event: string, handler: MessageHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  off(event: string, handler: MessageHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  subscribe(issueId: string): void {
    this.send({ type: 'subscribe', issueId });
  }

  private send(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }
}

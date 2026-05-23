import type WebSocket from "ws";
import { makeEvent } from "./protocol.js";

export class Broadcaster {
  private clients = new Set<WebSocket>();

  add(ws: WebSocket): void {
    this.clients.add(ws);
  }

  remove(ws: WebSocket): void {
    this.clients.delete(ws);
  }

  broadcast(event: string, payload: unknown): void {
    const frame = JSON.stringify(makeEvent(event, payload));
    for (const ws of this.clients) {
      if (ws.readyState === ws.OPEN) {
        ws.send(frame);
      }
    }
  }

  get clientCount(): number {
    return this.clients.size;
  }
}

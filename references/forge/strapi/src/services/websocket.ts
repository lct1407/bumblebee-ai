import { WebSocketServer, WebSocket } from 'ws';
import type { Core } from '@strapi/strapi';

let wss: WebSocketServer | null = null;
const sessionSubscriptions = new Map<string, Set<WebSocket>>();
const desktopClients = new Set<WebSocket>();
let desktopRegisteredViaHttp = false;

export function initWebSocket(strapi: Core.Strapi) {
  const server = strapi.server.httpServer;
  if (!server) {
    strapi.log.warn('No HTTP server found, WebSocket disabled');
    return;
  }

  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('error', (err) => {
    strapi.log.error(`WebSocket server error: ${err}`);
  });

  wss.on('connection', (ws) => {
    strapi.log.info('WebSocket client connected');

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'subscribe' && msg.sessionId) {
          let subs = sessionSubscriptions.get(msg.sessionId);
          if (!subs) {
            subs = new Set();
            sessionSubscriptions.set(msg.sessionId, subs);
          }
          subs.add(ws);
          strapi.log.info(`[ws] Client subscribed to session ${msg.sessionId} (${subs.size} total)`);
        } else if (msg.type === 'unsubscribe' && msg.sessionId) {
          sessionSubscriptions.get(msg.sessionId)?.delete(ws);
        } else if (msg.type === 'desktop:register') {
          desktopClients.add(ws);
          strapi.log.info('Desktop client registered');
          broadcast('desktop:connected', {});
        }
      } catch { /* ignore non-JSON messages */ }
    });

    ws.on('error', (err) => {
      strapi.log.error(`WebSocket client error: ${err}`);
    });

    ws.on('close', () => {
      for (const subs of sessionSubscriptions.values()) {
        subs.delete(ws);
      }
      if (desktopClients.delete(ws)) {
        strapi.log.info('Desktop client disconnected');
        // Clear HTTP registration when last WS client disconnects
        if (desktopClients.size === 0 && desktopRegisteredViaHttp) {
          desktopRegisteredViaHttp = false;
        }
        broadcast('desktop:disconnected', {});
      }
      strapi.log.info('WebSocket client disconnected');
    });
  });

  strapi.log.info('WebSocket server started on /ws');
}

export function broadcast(event: string, data: unknown) {
  if (!wss) return;
  const message = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

export function registerDesktop() {
  desktopRegisteredViaHttp = true;
  broadcast('desktop:connected', {});
}

export function unregisterDesktop() {
  desktopRegisteredViaHttp = false;
  broadcast('desktop:disconnected', {});
}

export function isDesktopConnected(): boolean {
  return desktopRegisteredViaHttp || desktopClients.size > 0;
}

/** Send a message only to registered desktop clients (WS-based). */
export function sendToDesktop(event: string, data: unknown) {
  if (desktopClients.size === 0) return;
  const message = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
  for (const ws of desktopClients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

export function sendToSession(sessionId: string, event: string, data: unknown) {
  const subs = sessionSubscriptions.get(sessionId);
  if (!subs || subs.size === 0) {
    globalThis.strapi?.log?.debug(`[ws] sendToSession(${sessionId}, ${event}): no subscribers`);
    return;
  }
  globalThis.strapi?.log?.debug(`[ws] sendToSession(${sessionId}, ${event}): ${subs.size} subscriber(s)`);
  const message = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
  for (const ws of subs) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

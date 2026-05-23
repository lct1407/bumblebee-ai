import http from "node:http";
import express, { type Express } from "express";
import { WebSocketServer, type WebSocket } from "ws";
import { RequestFrame, makeResponse, makeErrorResponse } from "./protocol.js";
import { authenticateToken, authenticateStrapiJwt, extractToken, type StrapiUser } from "./auth.js";
import { Broadcaster } from "./broadcast.js";

export interface GatewayOptions {
  port: number;
  token?: string;
  corsOrigins?: string[];
  strapiBaseUrl?: string;
}

// Extend WebSocket to carry user context
export interface AuthenticatedWebSocket extends WebSocket {
  strapiUser?: StrapiUser;
  strapiJwt?: string;
}

type MethodHandler = (params: unknown, ws?: AuthenticatedWebSocket) => Promise<unknown>;

export class Gateway {
  private readonly port: number;
  private readonly token?: string;
  private readonly corsOrigins: string[];
  private readonly strapiBaseUrl?: string;
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private readonly broadcaster = new Broadcaster();
  private readonly methods = new Map<string, MethodHandler>();
  private readonly startTime = Date.now();
  readonly app: Express;

  constructor(options: GatewayOptions) {
    this.port = options.port;
    this.token = options.token;
    this.corsOrigins = options.corsOrigins ?? [];
    this.strapiBaseUrl = options.strapiBaseUrl;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    if (this.corsOrigins.length > 0) {
      this.app.use((_req, res, next) => {
        const origin = _req.headers.origin;
        if (origin && this.corsOrigins.includes(origin)) {
          res.setHeader("Access-Control-Allow-Origin", origin);
          res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
          res.setHeader("Access-Control-Allow-Credentials", "true");
        }
        if (_req.method === "OPTIONS") {
          res.sendStatus(204);
          return;
        }
        next();
      });
    }
  }

  private setupRoutes(): void {
    this.app.get("/health", (_req, res) => {
      res.json({
        ok: true,
        uptime: Date.now() - this.startTime,
        clients: this.broadcaster.clientCount,
      });
    });
  }

  registerMethod(method: string, handler: MethodHandler): void {
    this.methods.set(method, handler);
  }

  broadcast(event: string, payload: unknown): void {
    this.broadcaster.broadcast(event, payload);
  }

  async start(): Promise<void> {
    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });

    this.wss.on("connection", async (ws: AuthenticatedWebSocket, req) => {
      const token = extractToken(req.url);

      // Try gateway token auth first
      let authenticated = authenticateToken(token, this.token);

      // If gateway token didn't match and we have Strapi configured, try Strapi JWT
      if (!authenticated && token && this.strapiBaseUrl) {
        const user = await authenticateStrapiJwt(token, this.strapiBaseUrl);
        if (user) {
          authenticated = true;
          ws.strapiUser = user;
          ws.strapiJwt = token;
        }
      }

      if (!authenticated) {
        ws.close(4001, "Unauthorized");
        return;
      }

      this.broadcaster.add(ws);

      ws.on("message", async (data) => {
        let raw: unknown;
        try {
          raw = JSON.parse(String(data));
        } catch {
          ws.send(JSON.stringify(makeErrorResponse("0", "PARSE_ERROR", "Invalid JSON")));
          return;
        }

        const parsed = RequestFrame.safeParse(raw);
        if (!parsed.success) {
          ws.send(JSON.stringify(makeErrorResponse("0", "INVALID_FRAME", "Invalid request frame")));
          return;
        }

        const frame = parsed.data;
        const handler = this.methods.get(frame.method);
        if (!handler) {
          ws.send(JSON.stringify(makeErrorResponse(frame.id, "METHOD_NOT_FOUND", `Unknown method: ${frame.method}`)));
          return;
        }

        try {
          const result = await handler(frame.params, ws);
          ws.send(JSON.stringify(makeResponse(frame.id, result)));
        } catch (err) {
          const message = err instanceof Error ? err.message : "Internal error";
          ws.send(JSON.stringify(makeErrorResponse(frame.id, "INTERNAL_ERROR", message)));
        }
      });

      ws.on("close", () => {
        this.broadcaster.remove(ws);
      });
    });

    await new Promise<void>((resolve) => {
      this.server!.listen(this.port, resolve);
    });
  }

  async stop(): Promise<void> {
    if (this.wss) {
      for (const client of this.wss.clients) {
        client.close(1001, "Server shutting down");
      }
      await new Promise<void>((resolve) => this.wss!.close(() => resolve()));
    }
    if (this.server) {
      await new Promise<void>((resolve, reject) =>
        this.server!.close((err) => (err ? reject(err) : resolve())),
      );
    }
  }
}

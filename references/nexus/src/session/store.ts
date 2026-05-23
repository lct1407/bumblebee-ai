import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateId } from "../utils/id.js";
import type { Session } from "./types.js";

export class SessionStore {
  private dir: string;
  private indexPath: string;
  private index: Map<string, Session> = new Map();

  constructor(dataDir: string) {
    this.dir = join(dataDir, "sessions");
    this.indexPath = join(this.dir, "index.json");
  }

  async init(): Promise<void> {
    await mkdir(join(this.dir, "transcripts"), { recursive: true });
    try {
      const raw = await readFile(this.indexPath, "utf-8");
      const data: Record<string, Session> = JSON.parse(raw);
      this.index = new Map(Object.entries(data));
    } catch {
      this.index = new Map();
      await this.save();
    }
  }

  async get(sessionKey: string): Promise<Session | undefined> {
    return this.index.get(sessionKey);
  }

  async getOrCreate(
    sessionKey: string,
    channel: string,
    displayName?: string,
  ): Promise<Session> {
    const existing = this.index.get(sessionKey);
    if (existing) return existing;

    const now = Date.now();
    const session: Session = {
      sessionId: generateId(),
      sessionKey,
      channel,
      displayName,
      createdAt: now,
      updatedAt: now,
      inputTokens: 0,
      outputTokens: 0,
    };
    this.index.set(sessionKey, session);
    await this.save();
    return session;
  }

  async update(
    sessionKey: string,
    updates: Partial<Session>,
  ): Promise<void> {
    const session = this.index.get(sessionKey);
    if (!session) return;
    Object.assign(session, updates, { updatedAt: Date.now() });
    await this.save();
  }

  async list(): Promise<Session[]> {
    return [...this.index.values()];
  }

  async delete(sessionKey: string): Promise<void> {
    this.index.delete(sessionKey);
    await this.save();
  }

  async save(): Promise<void> {
    const data = Object.fromEntries(this.index);
    await writeFile(this.indexPath, JSON.stringify(data, null, 2));
  }
}

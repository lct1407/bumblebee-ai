import Database from "better-sqlite3";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { createLogger } from "../utils/logger.js";

const log = createLogger("memory");

export interface Memory {
  id: number;
  user_key: string;
  category: string;
  content: string;
  created_at: number;
  last_used_at: number;
  use_count: number;
  source: string;
}

export interface MemoryConfig {
  enabled: boolean;
  maxPerUser: number;
  pruneAfterDays: number;
}

export class MemoryService {
  private db: Database.Database;
  private config: MemoryConfig;

  constructor(dataDir: string, config: MemoryConfig) {
    this.config = config;
    mkdirSync(dataDir, { recursive: true });
    const dbPath = join(dataDir, "nexus-memory.db");
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
  }

  init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_key TEXT NOT NULL,
        category TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER NOT NULL,
        use_count INTEGER DEFAULT 1,
        source TEXT DEFAULT 'auto'
      );
      CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_key);
    `);
    log.info("Memory database initialized");
  }

  getMemories(userKey: string, limit?: number): Memory[] {
    const max = limit ?? this.config.maxPerUser;
    const rows = this.db
      .prepare(
        `SELECT * FROM memories WHERE user_key = ? ORDER BY use_count DESC, last_used_at DESC LIMIT ?`,
      )
      .all(userKey, max) as Memory[];

    // Touch all returned memories
    const now = Date.now();
    const update = this.db.prepare(
      `UPDATE memories SET last_used_at = ?, use_count = use_count + 1 WHERE id = ?`,
    );
    const touchAll = this.db.transaction((ids: number[]) => {
      for (const id of ids) update.run(now, id);
    });
    touchAll(rows.map((r) => r.id));

    return rows;
  }

  addMemory(
    userKey: string,
    category: string,
    content: string,
    source: string = "auto",
  ): Memory {
    const existing = this.findDuplicate(userKey, content);
    if (existing) {
      this.touchMemory(existing.id);
      return existing;
    }

    // Enforce maxPerUser — remove oldest if at limit
    const count = (
      this.db
        .prepare(`SELECT COUNT(*) as cnt FROM memories WHERE user_key = ?`)
        .get(userKey) as { cnt: number }
    ).cnt;

    if (count >= this.config.maxPerUser) {
      this.db
        .prepare(
          `DELETE FROM memories WHERE id = (SELECT id FROM memories WHERE user_key = ? ORDER BY use_count ASC, last_used_at ASC LIMIT 1)`,
        )
        .run(userKey);
    }

    const now = Date.now();
    const info = this.db
      .prepare(
        `INSERT INTO memories (user_key, category, content, created_at, last_used_at, use_count, source) VALUES (?, ?, ?, ?, ?, 1, ?)`,
      )
      .run(userKey, category, content, now, now, source);

    log.info("Memory added", { userKey, category, content });
    return {
      id: info.lastInsertRowid as number,
      user_key: userKey,
      category,
      content,
      created_at: now,
      last_used_at: now,
      use_count: 1,
      source,
    };
  }

  removeMemory(id: number): boolean {
    const result = this.db.prepare(`DELETE FROM memories WHERE id = ?`).run(id);
    return result.changes > 0;
  }

  touchMemory(id: number): void {
    this.db
      .prepare(
        `UPDATE memories SET last_used_at = ?, use_count = use_count + 1 WHERE id = ?`,
      )
      .run(Date.now(), id);
  }

  pruneOld(olderThanDays?: number): number {
    const days = olderThanDays ?? this.config.pruneAfterDays;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const result = this.db
      .prepare(`DELETE FROM memories WHERE last_used_at < ? AND source = 'auto'`)
      .run(cutoff);
    if (result.changes > 0) {
      log.info(`Pruned ${result.changes} old memories`);
      this.db.exec("VACUUM");
    }
    return result.changes;
  }

  findDuplicate(userKey: string, content: string): Memory | null {
    // Simple substring match — if existing content contains or is contained by new content
    const rows = this.db
      .prepare(`SELECT * FROM memories WHERE user_key = ?`)
      .all(userKey) as Memory[];

    const normalized = content.toLowerCase().trim();
    for (const row of rows) {
      const existing = row.content.toLowerCase().trim();
      if (existing === normalized || existing.includes(normalized) || normalized.includes(existing)) {
        return row;
      }
    }
    return null;
  }

  close(): void {
    this.db.close();
  }
}

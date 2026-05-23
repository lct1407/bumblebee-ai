import { appendFile, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { TranscriptEntry } from "./types.js";

export class TranscriptWriter {
  private dir: string;

  constructor(sessionsDir: string) {
    this.dir = join(sessionsDir, "transcripts");
  }

  private path(sessionId: string): string {
    return join(this.dir, `${sessionId}.jsonl`);
  }

  async append(sessionId: string, entry: TranscriptEntry): Promise<void> {
    await appendFile(this.path(sessionId), JSON.stringify(entry) + "\n");
  }

  async read(sessionId: string): Promise<TranscriptEntry[]> {
    try {
      const raw = await readFile(this.path(sessionId), "utf-8");
      return raw
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as TranscriptEntry);
    } catch {
      return [];
    }
  }

  async clear(sessionId: string): Promise<void> {
    try {
      await unlink(this.path(sessionId));
    } catch {
      // file may not exist
    }
  }
}

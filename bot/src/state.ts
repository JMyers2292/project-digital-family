// Persistent state management.
// SQLite for chat sessions (future use). JSON file for sync session
// (also readable by the weekly-sync.sh shell script without compilation).

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

// ---- SQLite — chat sessions ----

let _db: Database.Database | null = null;

function getDb(dataPath: string): Database.Database {
  if (!_db) {
    fs.mkdirSync(dataPath, { recursive: true });
    _db = new Database(path.join(dataPath, "state.db"));
    _db.exec(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        telegram_chat_id INTEGER PRIMARY KEY,
        reasoner_session_id TEXT,
        last_activity_at INTEGER
      );
    `);
  }
  return _db;
}

export function getReasonerSession(dataPath: string, chatId: number): string | undefined {
  const row = getDb(dataPath)
    .prepare("SELECT reasoner_session_id FROM chat_sessions WHERE telegram_chat_id = ?")
    .get(chatId) as { reasoner_session_id: string | null } | undefined;
  return row?.reasoner_session_id ?? undefined;
}

export function setReasonerSession(dataPath: string, chatId: number, sessionId: string): void {
  getDb(dataPath)
    .prepare(
      `INSERT INTO chat_sessions (telegram_chat_id, reasoner_session_id, last_activity_at)
       VALUES (?, ?, ?)
       ON CONFLICT(telegram_chat_id) DO UPDATE SET
         reasoner_session_id = excluded.reasoner_session_id,
         last_activity_at = excluded.last_activity_at`,
    )
    .run(chatId, sessionId, Date.now());
}

// ---- JSON file — sync session ----
// Written by weekly-sync.sh and by the bot. Plain JSON so the shell
// script can read/write it without needing Node module resolution.

export type SyncSession = {
  startedAt: number;
  lastActivityAt: number;
  questionCount: number;
  status: "active" | "paused" | "complete";
};

function syncFilePath(dataPath: string): string {
  return path.join(dataPath, "sync-session.json");
}

export function getSyncSession(dataPath: string): SyncSession | null {
  const p = syncFilePath(dataPath);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as SyncSession;
  } catch {
    return null;
  }
}

export function setSyncSession(dataPath: string, session: SyncSession): void {
  fs.mkdirSync(dataPath, { recursive: true });
  fs.writeFileSync(syncFilePath(dataPath), JSON.stringify(session, null, 2));
}

export function clearSyncSession(dataPath: string): void {
  const p = syncFilePath(dataPath);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

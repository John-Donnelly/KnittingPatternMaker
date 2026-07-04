import { mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

/**
 * SQLite persistence for user accounts and saved patterns. Deliberately small: a saved
 * pattern is stored as its self-contained share-link token (the same stateless encoding
 * share links use), so the database never has to understand grids — it is a per-user index
 * over tokens plus a little display metadata.
 *
 * The `users` table carries the billing-ready columns (`plan`, `stripe_customer_id`) so a
 * Stripe integration only has to update rows here — see README "Stripe integration points".
 */

export interface UserRow {
  sub: string;
  email: string | null;
  name: string | null;
  plan: string;
  stripe_customer_id: string | null;
  created_at: number;
}

export interface PatternRow {
  id: number;
  user_sub: string;
  name: string;
  spec_token: string;
  technique: string;
  width: number;
  height: number;
  created_at: number;
}

export interface PatternSummary {
  id: number;
  name: string;
  technique: string;
  width: number;
  height: number;
  createdAt: number;
}

/** Most patterns a single account can keep — a sanity bound, not a business plan limit. */
export const MAX_SAVED_PATTERNS_PER_USER = 200;

export type AppDatabase = ReturnType<typeof openDatabase>;

export function openDatabase(dataDir: string) {
  let db: Database.Database;
  if (dataDir === ':memory:') {
    db = new Database(':memory:');
  } else {
    mkdirSync(dataDir, { recursive: true });
    db = new Database(path.join(dataDir, 'knitting-pattern-maker.sqlite3'));
    db.pragma('journal_mode = WAL');
  }
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      sub TEXT PRIMARY KEY,
      email TEXT,
      name TEXT,
      plan TEXT NOT NULL DEFAULT 'free',
      stripe_customer_id TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_sub TEXT NOT NULL REFERENCES users(sub) ON DELETE CASCADE,
      name TEXT NOT NULL,
      spec_token TEXT NOT NULL,
      technique TEXT NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_patterns_user ON patterns(user_sub, created_at DESC);
  `);

  const upsertUserStmt = db.prepare(`
    INSERT INTO users (sub, email, name, created_at) VALUES (@sub, @email, @name, @now)
    ON CONFLICT(sub) DO UPDATE SET email = excluded.email, name = excluded.name
  `);
  const getUserStmt = db.prepare('SELECT * FROM users WHERE sub = ?');
  const countStmt = db.prepare('SELECT COUNT(*) AS n FROM patterns WHERE user_sub = ?');
  const insertPatternStmt = db.prepare(`
    INSERT INTO patterns (user_sub, name, spec_token, technique, width, height, created_at)
    VALUES (@userSub, @name, @specToken, @technique, @width, @height, @now)
  `);
  const listStmt = db.prepare(`
    SELECT id, name, technique, width, height, created_at
    FROM patterns WHERE user_sub = ? ORDER BY created_at DESC, id DESC
  `);
  const getPatternStmt = db.prepare('SELECT * FROM patterns WHERE id = ? AND user_sub = ?');
  const deleteStmt = db.prepare('DELETE FROM patterns WHERE id = ? AND user_sub = ?');

  return {
    upsertUser(sub: string, email: string | undefined, name: string | undefined): void {
      upsertUserStmt.run({
        sub,
        email: email ?? null,
        name: name ?? null,
        now: Math.floor(Date.now() / 1000),
      });
    },

    getUser(sub: string): UserRow | undefined {
      return getUserStmt.get(sub) as UserRow | undefined;
    },

    countPatterns(userSub: string): number {
      return (countStmt.get(userSub) as { n: number }).n;
    },

    insertPattern(input: {
      userSub: string;
      name: string;
      specToken: string;
      technique: string;
      width: number;
      height: number;
    }): number {
      const result = insertPatternStmt.run({ ...input, now: Math.floor(Date.now() / 1000) });
      return Number(result.lastInsertRowid);
    },

    listPatterns(userSub: string): PatternSummary[] {
      return (listStmt.all(userSub) as Omit<PatternRow, 'user_sub' | 'spec_token'>[]).map(
        (row) => ({
          id: row.id,
          name: row.name,
          technique: row.technique,
          width: row.width,
          height: row.height,
          createdAt: row.created_at,
        }),
      );
    },

    getPattern(id: number, userSub: string): PatternRow | undefined {
      return getPatternStmt.get(id, userSub) as PatternRow | undefined;
    },

    deletePattern(id: number, userSub: string): boolean {
      return deleteStmt.run(id, userSub).changes > 0;
    },

    close(): void {
      db.close();
    },
  };
}

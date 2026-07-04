-- Same schema as the Node server's SQLite (apps/api/src/db.ts).
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

/**
 * D1 persistence — same two-table schema as the Node server's SQLite (see
 * apps/api/src/db.ts and migrations/0001_init.sql). All statements are prepared with bound
 * parameters; every pattern query is scoped to the session user.
 */

export interface PatternSummary {
  id: number;
  name: string;
  technique: string;
  width: number;
  height: number;
  createdAt: number;
}

export const MAX_SAVED_PATTERNS_PER_USER = 200;

export async function upsertUser(
  db: D1Database,
  sub: string,
  email: string | undefined,
  name: string | undefined,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO users (sub, email, name, created_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(sub) DO UPDATE SET email = excluded.email, name = excluded.name`,
    )
    .bind(sub, email ?? null, name ?? null, Math.floor(Date.now() / 1000))
    .run();
}

export async function getUserPlan(db: D1Database, sub: string): Promise<string> {
  const row = await db.prepare('SELECT plan FROM users WHERE sub = ?1').bind(sub).first<{
    plan: string;
  }>();
  return row?.plan ?? 'free';
}

export async function countPatterns(db: D1Database, sub: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM patterns WHERE user_sub = ?1')
    .bind(sub)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function insertPattern(
  db: D1Database,
  input: {
    userSub: string;
    name: string;
    specToken: string;
    technique: string;
    width: number;
    height: number;
  },
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO patterns (user_sub, name, spec_token, technique, width, height, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    )
    .bind(
      input.userSub,
      input.name,
      input.specToken,
      input.technique,
      input.width,
      input.height,
      Math.floor(Date.now() / 1000),
    )
    .run();
  return Number(result.meta.last_row_id);
}

export async function listPatterns(db: D1Database, sub: string): Promise<PatternSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT id, name, technique, width, height, created_at
       FROM patterns WHERE user_sub = ?1 ORDER BY created_at DESC, id DESC`,
    )
    .bind(sub)
    .all<{
      id: number;
      name: string;
      technique: string;
      width: number;
      height: number;
      created_at: number;
    }>();
  return results.map((r) => ({
    id: r.id,
    name: r.name,
    technique: r.technique,
    width: r.width,
    height: r.height,
    createdAt: r.created_at,
  }));
}

export async function getPattern(
  db: D1Database,
  id: number,
  sub: string,
): Promise<{
  id: number;
  name: string;
  spec: string;
  technique: string;
  width: number;
  height: number;
  createdAt: number;
} | null> {
  const row = await db
    .prepare('SELECT * FROM patterns WHERE id = ?1 AND user_sub = ?2')
    .bind(id, sub)
    .first<{
      id: number;
      name: string;
      spec_token: string;
      technique: string;
      width: number;
      height: number;
      created_at: number;
    }>();
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    spec: row.spec_token,
    technique: row.technique,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
  };
}

export async function deletePattern(db: D1Database, id: number, sub: string): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM patterns WHERE id = ?1 AND user_sub = ?2')
    .bind(id, sub)
    .run();
  return result.meta.changes > 0;
}

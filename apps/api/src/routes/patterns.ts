import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { decodePatternSpec, MAX_SHARE_LINK_LENGTH } from 'knitting-pattern-core';
import type { AppConfig } from '../config.js';
import type { AppDatabase } from '../db.js';
import { MAX_SAVED_PATTERNS_PER_USER } from '../db.js';
import { getSessionUser, type SessionUser } from '../auth/session.js';

/**
 * Saved patterns: per-account storage of self-contained share-spec tokens. Requires a
 * signed-in session (SSO), so every route here 401s anonymously and 503s when SSO isn't
 * configured at all — the frontend hides the feature in both cases.
 */

const SavePatternBodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  /** The share-link token (encodePatternSpec output) — validated by decoding it. */
  spec: z.string().min(1).max(MAX_SHARE_LINK_LENGTH),
});

export function registerPatternsRoutes(config: AppConfig, db: AppDatabase) {
  function requireUser(request: FastifyRequest, reply: FastifyReply): SessionUser | null {
    if (!config.oidcEnabled) {
      void reply.code(503).send({ error: 'Sign-in is not configured on this server' });
      return null;
    }
    const user = getSessionUser(request);
    if (!user) {
      void reply.code(401).send({ error: 'Sign in to use saved patterns' });
      return null;
    }
    return user;
  }

  return async function patternsRoutes(app: FastifyInstance): Promise<void> {
    app.get('/api/patterns', async (request, reply) => {
      const user = requireUser(request, reply);
      if (!user) return;
      return { patterns: db.listPatterns(user.sub) };
    });

    app.post('/api/patterns', async (request, reply) => {
      const user = requireUser(request, reply);
      if (!user) return;

      const parsed = SavePatternBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: 'Invalid pattern: name (1-100 chars) and spec required' });
      }

      // Validate the token by actually decoding it (untrusted input), and pull out display
      // metadata so listing doesn't need to decode every stored token.
      let technique: string;
      let width: number;
      let height: number;
      try {
        const spec = decodePatternSpec(parsed.data.spec);
        technique = spec.technique;
        width = spec.grid.width;
        height = spec.grid.height;
      } catch {
        return reply.code(400).send({ error: 'Invalid pattern data — could not decode it' });
      }

      // The user row normally exists from login; ensure it does (e.g. sessions minted before
      // the accounts table shipped).
      db.upsertUser(user.sub, user.email, user.name);

      if (db.countPatterns(user.sub) >= MAX_SAVED_PATTERNS_PER_USER) {
        return reply.code(409).send({
          error: `Pattern library is full (max ${MAX_SAVED_PATTERNS_PER_USER}) — delete some patterns first`,
        });
      }

      const id = db.insertPattern({
        userSub: user.sub,
        name: parsed.data.name,
        specToken: parsed.data.spec,
        technique,
        width,
        height,
      });
      return reply.code(201).send({ id });
    });

    app.get('/api/patterns/:id', async (request, reply) => {
      const user = requireUser(request, reply);
      if (!user) return;
      const id = Number((request.params as { id: string }).id);
      if (!Number.isInteger(id) || id < 1) return reply.code(400).send({ error: 'Invalid id' });
      const row = db.getPattern(id, user.sub);
      if (!row) return reply.code(404).send({ error: 'Pattern not found' });
      return {
        id: row.id,
        name: row.name,
        spec: row.spec_token,
        technique: row.technique,
        width: row.width,
        height: row.height,
        createdAt: row.created_at,
      };
    });

    app.delete('/api/patterns/:id', async (request, reply) => {
      const user = requireUser(request, reply);
      if (!user) return;
      const id = Number((request.params as { id: string }).id);
      if (!Number.isInteger(id) || id < 1) return reply.code(400).send({ error: 'Invalid id' });
      if (!db.deletePattern(id, user.sub)) {
        return reply.code(404).send({ error: 'Pattern not found' });
      }
      return reply.code(204).send();
    });
  };
}

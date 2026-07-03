import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../config.js';
import type { OidcUserInfo } from './oidc.js';

/**
 * Cookie-based sessions: the payload is base64url JSON carried in a cookie that
 * @fastify/cookie HMAC-signs with the session secret (tamper = unsign failure = no session).
 * Stateless by design — no session store — matching the rest of the app (share links are
 * stateless too). `exp` bounds the session lifetime server-side.
 */

export const SESSION_COOKIE = 'kpm_session';
export const OAUTH_STATE_COOKIE = 'kpm_oauth';

export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
export const OAUTH_STATE_TTL_SECONDS = 10 * 60; // login round-trip allowance

export type SessionUser = OidcUserInfo;

interface SessionPayload {
  user: SessionUser;
  /** Unix seconds. */
  exp: number;
}

export function encodeSessionValue(user: SessionUser, nowSeconds: number): string {
  const payload: SessionPayload = { user, exp: nowSeconds + SESSION_TTL_SECONDS };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeSessionValue(value: string, nowSeconds: number): SessionUser | null {
  try {
    const payload = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Partial<SessionPayload> | null;
    if (!payload || typeof payload.exp !== 'number' || payload.exp <= nowSeconds) return null;
    if (!payload.user || typeof payload.user.sub !== 'string') return null;
    return payload.user;
  } catch {
    return null;
  }
}

/** Reads and verifies the session cookie; null when absent, tampered, or expired. */
export function getSessionUser(request: FastifyRequest): SessionUser | null {
  const raw = request.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;
  return decodeSessionValue(unsigned.value, Math.floor(Date.now() / 1000));
}

export function setSessionCookie(reply: FastifyReply, config: AppConfig, user: SessionUser): void {
  reply.setCookie(SESSION_COOKIE, encodeSessionValue(user, Math.floor(Date.now() / 1000)), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    signed: true,
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

/**
 * Session/state cookies signed with Web Crypto HMAC-SHA256. Same semantics as the Node
 * server's sessions (base64url JSON payload, server-side expiry) with a Workers-native
 * signature: `<base64url payload>.<base64url hmac>`.
 */

export interface SessionUser {
  sub: string;
  name?: string;
  email?: string;
}

export const SESSION_COOKIE = 'kpm_session';
export const OAUTH_STATE_COOKIE = 'kpm_oauth';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
export const OAUTH_STATE_TTL_SECONDS = 10 * 60;

const encoder = new TextEncoder();

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array | null {
  try {
    const bin = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  } catch {
    return null;
  }
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signValue(payload: string, secret: string): Promise<string> {
  const key = await hmacKey(secret);
  const body = toBase64Url(encoder.encode(payload));
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  return `${body}.${toBase64Url(mac)}`;
}

export async function verifyValue(signed: string, secret: string): Promise<string | null> {
  const dot = signed.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = signed.slice(0, dot);
  const mac = fromBase64Url(signed.slice(dot + 1));
  const payload = fromBase64Url(body);
  if (!mac || !payload) return null;
  const key = await hmacKey(secret);
  // crypto.subtle.verify is constant-time — never compare MACs with ===.
  const ok = await crypto.subtle.verify('HMAC', key, new Uint8Array(mac), encoder.encode(body));
  if (!ok) return null;
  return new TextDecoder().decode(payload);
}

interface SessionPayload {
  user: SessionUser;
  exp: number;
}

export async function encodeSessionCookie(user: SessionUser, secret: string): Promise<string> {
  const payload: SessionPayload = {
    user,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  return signValue(JSON.stringify(payload), secret);
}

export async function decodeSessionCookie(
  value: string | undefined,
  secret: string | undefined,
): Promise<SessionUser | null> {
  if (!value || !secret) return null;
  const payload = await verifyValue(value, secret);
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload) as Partial<SessionPayload> | null;
    if (!parsed || typeof parsed.exp !== 'number' || parsed.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    if (!parsed.user || typeof parsed.user.sub !== 'string') return null;
    return parsed.user;
  } catch {
    return null;
  }
}

export function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return toBase64Url(digest);
}

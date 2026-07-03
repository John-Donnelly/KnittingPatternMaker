import { createHash, randomBytes } from 'node:crypto';
import type { AppConfig } from '../config.js';

/**
 * Minimal OIDC authorization-code + PKCE client against any standards-compliant provider
 * (Google, Microsoft Entra, Okta, Auth0, Keycloak, ...). Deliberately small and auditable:
 * discovery -> authorization redirect -> code exchange -> userinfo. Identity comes from the
 * provider's `userinfo` endpoint over TLS (no local JWT validation needed, since we never
 * accept tokens from the browser — only the code we exchange server-side).
 */

export interface OidcDiscovery {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
}

export class OidcError extends Error {}

const discoveryCache = new Map<string, OidcDiscovery>();

export async function discoverOidc(issuer: string): Promise<OidcDiscovery> {
  const cached = discoveryCache.get(issuer);
  if (cached) return cached;

  const url = `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new OidcError(`OIDC discovery failed: ${url} returned ${res.status}`);
  }
  const doc = (await res.json()) as Partial<OidcDiscovery>;
  if (!doc.authorization_endpoint || !doc.token_endpoint || !doc.userinfo_endpoint) {
    throw new OidcError(`OIDC discovery document at ${url} is missing required endpoints`);
  }
  const discovery: OidcDiscovery = {
    authorization_endpoint: doc.authorization_endpoint,
    token_endpoint: doc.token_endpoint,
    userinfo_endpoint: doc.userinfo_endpoint,
  };
  discoveryCache.set(issuer, discovery);
  return discovery;
}

/** For tests: pre-seed or clear the discovery cache. */
export function primeDiscoveryCache(issuer: string, discovery: OidcDiscovery | null): void {
  if (discovery) discoveryCache.set(issuer, discovery);
  else discoveryCache.delete(issuer);
}

export interface PkcePair {
  verifier: string;
  challenge: string;
}

export function generatePkce(): PkcePair {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function generateState(): string {
  return randomBytes(16).toString('base64url');
}

export function buildAuthorizationUrl(
  discovery: OidcDiscovery,
  config: AppConfig,
  state: string,
  codeChallenge: string,
): string {
  const url = new URL(discovery.authorization_endpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.oidcClientId ?? '');
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export interface OidcUserInfo {
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
}

export async function exchangeCodeForUserInfo(
  discovery: OidcDiscovery,
  config: AppConfig,
  code: string,
  codeVerifier: string,
): Promise<OidcUserInfo> {
  const tokenRes = await fetch(discovery.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
      client_id: config.oidcClientId ?? '',
      client_secret: config.oidcClientSecret ?? '',
      code_verifier: codeVerifier,
    }),
  });
  if (!tokenRes.ok) {
    throw new OidcError(`Token exchange failed with status ${tokenRes.status}`);
  }
  const tokens = (await tokenRes.json()) as { access_token?: string };
  if (!tokens.access_token) {
    throw new OidcError('Token response did not include an access_token');
  }

  const userRes = await fetch(discovery.userinfo_endpoint, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!userRes.ok) {
    throw new OidcError(`Userinfo request failed with status ${userRes.status}`);
  }
  const info = (await userRes.json()) as Partial<OidcUserInfo>;
  if (!info.sub) {
    throw new OidcError('Userinfo response did not include a sub claim');
  }
  return {
    sub: info.sub,
    ...(info.name ? { name: info.name } : {}),
    ...(info.email ? { email: info.email } : {}),
    ...(info.picture ? { picture: info.picture } : {}),
  };
}

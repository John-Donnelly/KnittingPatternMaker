// Port of apps/api/src/auth/oidc.ts for Workers: same authorization-code + PKCE flow, with
// AbortSignal timeouts on every provider fetch (a hung IdP must not hold the request open).
import type { WorkerConfig } from './env.js';

export interface OidcDiscovery {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
}

export class OidcError extends Error {}

const FETCH_TIMEOUT_MS = 5000;

const discoveryCache = new Map<string, OidcDiscovery>();

export async function discoverOidc(issuer: string): Promise<OidcDiscovery> {
  const cached = discoveryCache.get(issuer);
  if (cached) return cached;

  const url = `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new OidcError(`OIDC discovery failed: ${url} returned ${res.status}`);
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

export function buildAuthorizationUrl(
  discovery: OidcDiscovery,
  config: WorkerConfig,
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
}

export async function exchangeCodeForUserInfo(
  discovery: OidcDiscovery,
  config: WorkerConfig,
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
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!tokenRes.ok) throw new OidcError(`Token exchange failed with status ${tokenRes.status}`);
  const tokens = (await tokenRes.json()) as { access_token?: string };
  if (!tokens.access_token) throw new OidcError('Token response did not include an access_token');

  const userRes = await fetch(discovery.userinfo_endpoint, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!userRes.ok) throw new OidcError(`Userinfo request failed with status ${userRes.status}`);
  const info = (await userRes.json()) as Partial<OidcUserInfo>;
  if (!info.sub) throw new OidcError('Userinfo response did not include a sub claim');
  return {
    sub: info.sub,
    ...(info.name ? { name: info.name } : {}),
    ...(info.email ? { email: info.email } : {}),
  };
}

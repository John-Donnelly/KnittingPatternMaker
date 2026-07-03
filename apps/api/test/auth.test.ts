import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { buildServer } from '../src/server.js';
import { primeDiscoveryCache, type OidcDiscovery } from '../src/auth/oidc.js';
import { decodeSessionValue, encodeSessionValue } from '../src/auth/session.js';
import { makeTestImagePng } from './helpers.js';

const ISSUER = 'https://idp.example.test';
const DISCOVERY: OidcDiscovery = {
  authorization_endpoint: `${ISSUER}/authorize`,
  token_endpoint: `${ISSUER}/token`,
  userinfo_endpoint: `${ISSUER}/userinfo`,
};

const OIDC_OVERRIDES = {
  oidcIssuer: ISSUER,
  oidcClientId: 'test-client',
  oidcClientSecret: 'test-secret',
  sessionSecret: 'a'.repeat(40),
  publicUrl: 'https://knit.example.test',
} as const;

function cookiesOf(res: { headers: Record<string, unknown> }): string[] {
  const raw = res.headers['set-cookie'];
  return Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
}

afterEach(() => {
  primeDiscoveryCache(ISSUER, null);
  vi.unstubAllGlobals();
});

describe('session encoding', () => {
  it('round-trips a user and enforces expiry', () => {
    const user = { sub: 'u1', email: 'a@b.c' };
    const value = encodeSessionValue(user, 1000);
    expect(decodeSessionValue(value, 1000)).toEqual(user);
    expect(decodeSessionValue(value, 1000 + 8 * 24 * 60 * 60)).toBeNull();
    expect(decodeSessionValue('garbage', 1000)).toBeNull();
  });
});

describe('auth routes', () => {
  it('reports auth disabled when OIDC is not configured', async () => {
    const app = buildServer();
    await app.ready();
    const res = await request(app.server).get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      authEnabled: false,
      authRequired: false,
      authenticated: false,
    });
    await app.close();
  });

  it('returns 503 from /api/auth/login when OIDC is not configured', async () => {
    const app = buildServer();
    await app.ready();
    const res = await request(app.server).get('/api/auth/login');
    expect(res.status).toBe(503);
    await app.close();
  });

  it('redirects to the provider with PKCE + state and sets the state cookie', async () => {
    primeDiscoveryCache(ISSUER, DISCOVERY);
    const app = buildServer(OIDC_OVERRIDES);
    await app.ready();

    const res = await request(app.server).get('/api/auth/login');
    expect(res.status).toBe(302);
    const location = new URL(res.headers.location ?? '');
    expect(location.origin + location.pathname).toBe(DISCOVERY.authorization_endpoint);
    expect(location.searchParams.get('client_id')).toBe('test-client');
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.get('state')).toBeTruthy();
    expect(location.searchParams.get('redirect_uri')).toBe(
      'https://knit.example.test/api/auth/callback',
    );
    expect(cookiesOf(res).some((c) => c.startsWith('kpm_oauth='))).toBe(true);
    await app.close();
  });

  it('rejects a callback whose state does not match the cookie', async () => {
    primeDiscoveryCache(ISSUER, DISCOVERY);
    const app = buildServer(OIDC_OVERRIDES);
    await app.ready();

    const login = await request(app.server).get('/api/auth/login');
    const stateCookie = cookiesOf(login).find((c) => c.startsWith('kpm_oauth=')) ?? '';

    const res = await request(app.server)
      .get('/api/auth/callback?code=abc&state=WRONG')
      .set('Cookie', stateCookie.split(';')[0] ?? '');
    expect(res.status).toBe(400);
    await app.close();
  });

  it('completes the full login round trip and establishes a session', async () => {
    primeDiscoveryCache(ISSUER, DISCOVERY);
    const app = buildServer(OIDC_OVERRIDES);
    await app.ready();

    const login = await request(app.server).get('/api/auth/login');
    const state = new URL(login.headers.location ?? '').searchParams.get('state') ?? '';
    const stateCookie = (cookiesOf(login).find((c) => c.startsWith('kpm_oauth=')) ?? '').split(
      ';',
    )[0];

    // Fake provider: token exchange + userinfo.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url === DISCOVERY.token_endpoint) {
          return new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 });
        }
        if (url === DISCOVERY.userinfo_endpoint) {
          return new Response(
            JSON.stringify({ sub: 'user-1', name: 'Test Knitter', email: 't@example.test' }),
            { status: 200 },
          );
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    const cb = await request(app.server)
      .get(`/api/auth/callback?code=authcode&state=${state}`)
      .set('Cookie', stateCookie ?? '');
    expect(cb.status).toBe(302);
    expect(cb.headers.location).toBe('/app');
    const sessionCookie = (cookiesOf(cb).find((c) => c.startsWith('kpm_session=')) ?? '').split(
      ';',
    )[0];
    expect(sessionCookie).toBeTruthy();

    const me = await request(app.server)
      .get('/api/auth/me')
      .set('Cookie', sessionCookie ?? '');
    expect(me.body).toMatchObject({
      authenticated: true,
      user: { sub: 'user-1', name: 'Test Knitter' },
    });

    const logout = await request(app.server)
      .post('/api/auth/logout')
      .set('Cookie', sessionCookie ?? '');
    expect(logout.status).toBe(204);
    await app.close();
  });

  it('gates pattern generation behind sign-in when AUTH_REQUIRED is on', async () => {
    primeDiscoveryCache(ISSUER, DISCOVERY);
    const app = buildServer({ ...OIDC_OVERRIDES, authRequired: true });
    await app.ready();

    const image = await makeTestImagePng(10, 10);
    const anonymous = await request(app.server)
      .post('/api/pattern')
      .attach('image', image, 'test.png');
    expect(anonymous.status).toBe(401);

    // With a valid session cookie the same request goes through.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url === DISCOVERY.token_endpoint) {
          return new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 });
        }
        return new Response(JSON.stringify({ sub: 'user-2' }), { status: 200 });
      }),
    );
    const login = await request(app.server).get('/api/auth/login');
    const state = new URL(login.headers.location ?? '').searchParams.get('state') ?? '';
    const stateCookie = (cookiesOf(login).find((c) => c.startsWith('kpm_oauth=')) ?? '').split(
      ';',
    )[0];
    const cb = await request(app.server)
      .get(`/api/auth/callback?code=c&state=${state}`)
      .set('Cookie', stateCookie ?? '');
    const sessionCookie = (cookiesOf(cb).find((c) => c.startsWith('kpm_session=')) ?? '').split(
      ';',
    )[0];

    const signedIn = await request(app.server)
      .post('/api/pattern')
      .set('Cookie', sessionCookie ?? '')
      .attach('image', image, 'test.png');
    expect(signedIn.status).toBe(200);
    await app.close();
  });

  it('leaves pattern generation open when auth is not required', async () => {
    const app = buildServer();
    await app.ready();
    const image = await makeTestImagePng(10, 10);
    const res = await request(app.server).post('/api/pattern').attach('image', image, 'test.png');
    expect(res.status).toBe(200);
    await app.close();
  });
});

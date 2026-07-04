import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { encodePatternSpec } from 'knitting-pattern-core';
import { buildServer } from '../src/server.js';
import { primeDiscoveryCache, type OidcDiscovery } from '../src/auth/oidc.js';

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

/** Runs the mocked OIDC round trip and returns a session cookie for the given subject. */
async function signIn(app: FastifyInstance, sub: string): Promise<string> {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url === DISCOVERY.token_endpoint) {
        return new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 });
      }
      return new Response(JSON.stringify({ sub, name: `User ${sub}` }), { status: 200 });
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
  const session = (cookiesOf(cb).find((c) => c.startsWith('kpm_session=')) ?? '').split(';')[0];
  vi.unstubAllGlobals();
  if (!session) throw new Error('sign-in helper failed to obtain a session cookie');
  return session;
}

/** A tiny valid share-spec token to store. */
function makeSpecToken(width = 4, height = 4): string {
  return encodePatternSpec({
    technique: 'stranded',
    grid: {
      width,
      height,
      indices: new Uint16Array(width * height),
      palette: [{ r: 10, g: 20, b: 30 }],
    },
  });
}

describe('saved patterns API', () => {
  afterEach(() => {
    primeDiscoveryCache(ISSUER, null);
    vi.unstubAllGlobals();
  });

  it('requires sign-in (401 anonymous, 503 when SSO unconfigured)', async () => {
    const configured = buildServer(OIDC_OVERRIDES);
    await configured.ready();
    expect((await request(configured.server).get('/api/patterns')).status).toBe(401);
    await configured.close();

    const unconfigured = buildServer();
    await unconfigured.ready();
    expect((await request(unconfigured.server).get('/api/patterns')).status).toBe(503);
    await unconfigured.close();
  });

  it('saves, lists, fetches, and deletes a pattern for the signed-in user', async () => {
    primeDiscoveryCache(ISSUER, DISCOVERY);
    const app = buildServer(OIDC_OVERRIDES);
    await app.ready();
    const session = await signIn(app, 'knitter-1');

    const spec = makeSpecToken(6, 8);
    const created = await request(app.server)
      .post('/api/patterns')
      .set('Cookie', session)
      .send({ name: 'Forest border', spec });
    expect(created.status).toBe(201);
    const id = created.body.id as number;

    const list = await request(app.server).get('/api/patterns').set('Cookie', session);
    expect(list.status).toBe(200);
    expect(list.body.patterns).toHaveLength(1);
    expect(list.body.patterns[0]).toMatchObject({
      id,
      name: 'Forest border',
      technique: 'stranded',
      width: 6,
      height: 8,
    });

    const fetched = await request(app.server).get(`/api/patterns/${id}`).set('Cookie', session);
    expect(fetched.status).toBe(200);
    expect(fetched.body.spec).toBe(spec);

    const deleted = await request(app.server).delete(`/api/patterns/${id}`).set('Cookie', session);
    expect(deleted.status).toBe(204);
    const after = await request(app.server).get('/api/patterns').set('Cookie', session);
    expect(after.body.patterns).toHaveLength(0);
    await app.close();
  });

  it('isolates patterns between users', async () => {
    primeDiscoveryCache(ISSUER, DISCOVERY);
    const app = buildServer(OIDC_OVERRIDES);
    await app.ready();
    const alice = await signIn(app, 'alice');
    const bob = await signIn(app, 'bob');

    const created = await request(app.server)
      .post('/api/patterns')
      .set('Cookie', alice)
      .send({ name: 'Alice heart', spec: makeSpecToken() });
    const id = created.body.id as number;

    expect(
      (await request(app.server).get('/api/patterns').set('Cookie', bob)).body.patterns,
    ).toHaveLength(0);
    expect((await request(app.server).get(`/api/patterns/${id}`).set('Cookie', bob)).status).toBe(
      404,
    );
    expect(
      (await request(app.server).delete(`/api/patterns/${id}`).set('Cookie', bob)).status,
    ).toBe(404);
    // Alice still has it.
    expect((await request(app.server).get(`/api/patterns/${id}`).set('Cookie', alice)).status).toBe(
      200,
    );
    await app.close();
  });

  it('rejects an undecodable spec token and a missing name', async () => {
    primeDiscoveryCache(ISSUER, DISCOVERY);
    const app = buildServer(OIDC_OVERRIDES);
    await app.ready();
    const session = await signIn(app, 'knitter-2');

    const badSpec = await request(app.server)
      .post('/api/patterns')
      .set('Cookie', session)
      .send({ name: 'Broken', spec: 'not-a-valid-token' });
    expect(badSpec.status).toBe(400);

    const noName = await request(app.server)
      .post('/api/patterns')
      .set('Cookie', session)
      .send({ name: '   ', spec: makeSpecToken() });
    expect(noName.status).toBe(400);
    await app.close();
  });

  it('reports the plan on /api/auth/me after login (stripe-ready accounts)', async () => {
    primeDiscoveryCache(ISSUER, DISCOVERY);
    const app = buildServer(OIDC_OVERRIDES);
    await app.ready();
    const session = await signIn(app, 'knitter-3');
    const me = await request(app.server).get('/api/auth/me').set('Cookie', session);
    expect(me.body).toMatchObject({ authenticated: true, plan: 'free' });
    await app.close();
  });
});

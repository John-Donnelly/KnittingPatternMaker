/**
 * Cloudflare Workers entry: Hono app serving /api/* (static assets for the SPA are served by
 * the Workers assets pipeline via wrangler.jsonc; only /api/* reaches this code, plus any
 * not-found falls through single-page-application handling).
 *
 * The API contract is 1:1 with the Fastify server (apps/api) so apps/web works unchanged.
 */
import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { secureHeaders } from 'hono/secure-headers';
import {
  buildPatternResult,
  buildYardageEstimate,
  decodePatternSpec,
  deserializeGrid,
  CORE_VERSION,
  MAX_SHARE_LINK_LENGTH,
} from 'knitting-pattern-core';
import { z } from 'zod';
import { loadConfig, type Env } from './env.js';
import {
  decodeSessionCookie,
  encodeSessionCookie,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_SECONDS,
  randomToken,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  sha256Base64Url,
  signValue,
  verifyValue,
  type SessionUser,
} from './cookies.js';
import { buildAuthorizationUrl, discoverOidc, exchangeCodeForUserInfo, OidcError } from './oidc.js';
import { runPipeline } from './pipeline.js';
import { ImageDecodeError } from './decode.js';
import { PatternOptionsSchema, PatternSpecBodySchema } from './schemas.js';
import { renderPatternPdf } from './export/pdf.js';
import { renderChartPng } from './export/chartPng.js';
import * as db from './db.js';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const app = new Hono<{ Bindings: Env }>();

app.use(
  '*',
  secureHeaders({
    // API responses are JSON/binary; the SPA's HTML is served by the assets pipeline.
    crossOriginResourcePolicy: 'same-origin',
  }),
);

app.get('/api/health', (c) => c.json({ status: 'ok', coreVersion: CORE_VERSION }));
app.get('/health', (c) => c.json({ status: 'ok', coreVersion: CORE_VERSION }));

// --- auth ---------------------------------------------------------------------------------

async function sessionUser(
  c: { req: { raw: Request } } & { env: Env },
  secret: string | undefined,
) {
  const raw = getCookie(c as never, SESSION_COOKIE);
  return decodeSessionCookie(raw, secret);
}

app.get('/api/auth/me', async (c) => {
  const config = loadConfig(c.env);
  const user = await sessionUser(c, config.sessionSecret);
  const plan = user ? await db.getUserPlan(c.env.DB, user.sub) : undefined;
  return c.json({
    authEnabled: config.oidcEnabled,
    authRequired: config.authRequired,
    authenticated: user !== null,
    ...(user ? { user, plan: plan ?? 'free' } : {}),
  });
});

app.get('/api/auth/login', async (c) => {
  const config = loadConfig(c.env);
  if (!config.oidcEnabled || !config.oidcIssuer || !config.sessionSecret) {
    return c.json({ error: 'Single sign-on is not configured on this server' }, 503);
  }
  const discovery = await discoverOidc(config.oidcIssuer);
  const state = randomToken();
  const verifier = randomToken() + randomToken();
  const challenge = await sha256Base64Url(verifier);

  setCookie(c, OAUTH_STATE_COOKIE, await signValue(`${state}.${verifier}`, config.sessionSecret), {
    path: '/api/auth',
    httpOnly: true,
    sameSite: 'Lax',
    secure: config.publicUrl.startsWith('https://'),
    maxAge: OAUTH_STATE_TTL_SECONDS,
  });
  return c.redirect(buildAuthorizationUrl(discovery, config, state, challenge), 302);
});

app.get('/api/auth/callback', async (c) => {
  const config = loadConfig(c.env);
  if (!config.oidcEnabled || !config.oidcIssuer || !config.sessionSecret) {
    return c.json({ error: 'Single sign-on is not configured on this server' }, 503);
  }
  const code = c.req.query('code');
  const state = c.req.query('state');
  if (!code || !state) return c.json({ error: 'Missing code or state in callback' }, 400);

  const rawState = getCookie(c, OAUTH_STATE_COOKIE);
  deleteCookie(c, OAUTH_STATE_COOKIE, { path: '/api/auth' });
  const statePayload = rawState ? await verifyValue(rawState, config.sessionSecret) : null;
  const dot = statePayload?.indexOf('.') ?? -1;
  const expectedState = dot > 0 ? statePayload?.slice(0, dot) : undefined;
  const verifier = dot > 0 ? statePayload?.slice(dot + 1) : undefined;
  if (!expectedState || !verifier || expectedState !== state) {
    return c.json({ error: 'Login state mismatch — please try again' }, 400);
  }

  try {
    const discovery = await discoverOidc(config.oidcIssuer);
    const user = await exchangeCodeForUserInfo(discovery, config, code, verifier);
    await db.upsertUser(c.env.DB, user.sub, user.email, user.name);
    setCookie(c, SESSION_COOKIE, await encodeSessionCookie(user, config.sessionSecret), {
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      secure: config.publicUrl.startsWith('https://'),
      maxAge: SESSION_TTL_SECONDS,
    });
    return c.redirect('/app', 302);
  } catch (err) {
    if (err instanceof OidcError) {
      return c.json({ error: 'Sign-in failed — please try again' }, 502);
    }
    throw err;
  }
});

app.post('/api/auth/logout', (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.body(null, 204);
});

// --- pattern generation ---------------------------------------------------------------------

async function requireSessionIfConfigured(
  c: { env: Env } & { req: { raw: Request } },
): Promise<{ ok: true } | { ok: false; status: 401; error: string }> {
  const config = loadConfig(c.env);
  if (!config.authRequired) return { ok: true };
  const user = await sessionUser(c, config.sessionSecret);
  if (user) return { ok: true };
  return { ok: false, status: 401, error: 'Sign in to generate patterns' };
}

app.post('/api/pattern', async (c) => {
  const gate = await requireSessionIfConfigured(c);
  if (!gate.ok) return c.json({ error: gate.error }, gate.status);

  const contentLength = Number(c.req.header('content-length') ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES) {
    return c.json({ error: 'Uploaded file is too large (max 25MB)' }, 413);
  }

  let form: FormData;
  try {
    form = await c.req.raw.formData();
  } catch {
    return c.json({ error: 'Expected multipart form data with an "image" file field' }, 400);
  }

  const image = form.get('image');
  // FormDataEntryValue is File | string; a string means the field wasn't a file upload.
  if (image === null || typeof image === 'string') {
    return c.json({ error: 'Missing "image" file field' }, 400);
  }
  // Reject unexpected extra file fields rather than silently ignoring them.
  for (const [key, value] of form.entries()) {
    if (typeof value !== 'string' && key !== 'image') {
      return c.json({ error: `Unexpected file field "${key}" — only "image" is accepted` }, 400);
    }
  }

  const optionsRaw = form.get('options');
  let optionsJson: unknown = {};
  if (typeof optionsRaw === 'string' && optionsRaw.length > 0) {
    try {
      optionsJson = JSON.parse(optionsRaw);
    } catch {
      return c.json({ error: 'Invalid JSON in "options" field' }, 400);
    }
  }

  const parsed = PatternOptionsSchema.safeParse(optionsJson);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return c.json(
      { error: first ? first.message : 'Invalid options', details: parsed.error.issues },
      400,
    );
  }

  try {
    const result = await runPipeline(await image.arrayBuffer(), parsed.data);
    return c.json(result);
  } catch (err) {
    if (err instanceof ImageDecodeError) return c.json({ error: err.message }, 400);
    throw err;
  }
});

// --- exports ----------------------------------------------------------------------------------

function filenameSlug(title: string | undefined): string | null {
  if (!title) return null;
  const slug = title
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60);
  return slug.length > 0 ? slug : null;
}

app.post('/api/export/pdf', async (c) => {
  const gate = await requireSessionIfConfigured(c);
  if (!gate.ok) return c.json({ error: gate.error }, gate.status);

  const parsed = PatternSpecBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Invalid pattern spec', details: parsed.error.issues }, 400);
  }
  const { technique, gauge, grid: gridJson, seamless, title } = parsed.data;
  const grid = deserializeGrid(gridJson);
  const pattern = buildPatternResult(technique, grid);
  const yardage = buildYardageEstimate(grid, gauge, pattern);
  const pdfBytes = await renderPatternPdf({
    technique,
    grid,
    pattern,
    yardage,
    widthStitches: grid.width,
    heightRows: grid.height,
    ...(gauge ? { gauge } : {}),
    ...(seamless !== undefined ? { seamless } : {}),
    ...(title ? { title } : {}),
  });
  return c.body(pdfBytes.buffer as ArrayBuffer, 200, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${filenameSlug(title) ?? 'knitting-pattern'}.pdf"`,
  });
});

app.post('/api/export/png', async (c) => {
  const gate = await requireSessionIfConfigured(c);
  if (!gate.ok) return c.json({ error: gate.error }, gate.status);

  const parsed = PatternSpecBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Invalid pattern spec', details: parsed.error.issues }, 400);
  }
  const png = renderChartPng(deserializeGrid(parsed.data.grid));
  return c.body(png.buffer as ArrayBuffer, 200, {
    'Content-Type': 'image/png',
    'Content-Disposition': `attachment; filename="${filenameSlug(parsed.data.title) ?? 'knitting-pattern'}-chart.png"`,
  });
});

// --- saved patterns -----------------------------------------------------------------------------

const SavePatternBodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  spec: z.string().min(1).max(MAX_SHARE_LINK_LENGTH),
});

async function requirePatternsUser(c: {
  env: Env;
  req: { raw: Request };
}): Promise<{ user: SessionUser } | { error: string; status: 401 | 503 }> {
  const config = loadConfig(c.env);
  if (!config.oidcEnabled || !config.sessionSecret) {
    return { error: 'Sign-in is not configured on this server', status: 503 };
  }
  const user = await sessionUser(c, config.sessionSecret);
  if (!user) return { error: 'Sign in to use saved patterns', status: 401 };
  return { user };
}

app.get('/api/patterns', async (c) => {
  const auth = await requirePatternsUser(c);
  if ('error' in auth) return c.json({ error: auth.error }, auth.status);
  return c.json({ patterns: await db.listPatterns(c.env.DB, auth.user.sub) });
});

app.post('/api/patterns', async (c) => {
  const auth = await requirePatternsUser(c);
  if ('error' in auth) return c.json({ error: auth.error }, auth.status);

  const parsed = SavePatternBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Invalid pattern: name (1-100 chars) and spec required' }, 400);
  }
  let technique: string;
  let width: number;
  let height: number;
  try {
    const spec = decodePatternSpec(parsed.data.spec);
    technique = spec.technique;
    width = spec.grid.width;
    height = spec.grid.height;
  } catch {
    return c.json({ error: 'Invalid pattern data — could not decode it' }, 400);
  }

  await db.upsertUser(c.env.DB, auth.user.sub, auth.user.email, auth.user.name);
  if ((await db.countPatterns(c.env.DB, auth.user.sub)) >= db.MAX_SAVED_PATTERNS_PER_USER) {
    return c.json(
      {
        error: `Pattern library is full (max ${db.MAX_SAVED_PATTERNS_PER_USER}) — delete some patterns first`,
      },
      409,
    );
  }
  const id = await db.insertPattern(c.env.DB, {
    userSub: auth.user.sub,
    name: parsed.data.name,
    specToken: parsed.data.spec,
    technique,
    width,
    height,
  });
  return c.json({ id }, 201);
});

app.get('/api/patterns/:id', async (c) => {
  const auth = await requirePatternsUser(c);
  if ('error' in auth) return c.json({ error: auth.error }, auth.status);
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return c.json({ error: 'Invalid id' }, 400);
  const row = await db.getPattern(c.env.DB, id, auth.user.sub);
  if (!row) return c.json({ error: 'Pattern not found' }, 404);
  return c.json(row);
});

app.delete('/api/patterns/:id', async (c) => {
  const auth = await requirePatternsUser(c);
  if ('error' in auth) return c.json({ error: auth.error }, auth.status);
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return c.json({ error: 'Invalid id' }, 400);
  if (!(await db.deletePattern(c.env.DB, id, auth.user.sub))) {
    return c.json({ error: 'Pattern not found' }, 404);
  }
  return c.body(null, 204);
});

// Unknown /api routes are a JSON 404 (everything non-/api is handled by static assets).
app.notFound((c) => c.json({ error: 'Not found' }, 404));

app.onError((err, c) => {
  console.error('unhandled error', err instanceof Error ? err.stack : err);
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;

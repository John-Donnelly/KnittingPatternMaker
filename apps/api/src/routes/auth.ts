import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../config.js';
import {
  buildAuthorizationUrl,
  discoverOidc,
  exchangeCodeForUserInfo,
  generatePkce,
  generateState,
  OidcError,
} from '../auth/oidc.js';
import {
  clearSessionCookie,
  getSessionUser,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_SECONDS,
  setSessionCookie,
} from '../auth/session.js';

export function registerAuthRoutes(config: AppConfig) {
  return async function authRoutes(app: FastifyInstance): Promise<void> {
    /** Who am I? Also tells the frontend whether SSO is available/required at all. */
    app.get('/api/auth/me', async (request) => {
      const user = getSessionUser(request);
      return {
        authEnabled: config.oidcEnabled,
        authRequired: config.authRequired && config.oidcEnabled,
        authenticated: user !== null,
        ...(user ? { user } : {}),
      };
    });

    /** Starts the SSO round trip: PKCE + state in a short-lived signed cookie, then redirect. */
    app.get('/api/auth/login', async (request, reply) => {
      if (!config.oidcEnabled || !config.oidcIssuer) {
        return reply.code(503).send({ error: 'Single sign-on is not configured on this server' });
      }
      const discovery = await discoverOidc(config.oidcIssuer);
      const state = generateState();
      const { verifier, challenge } = generatePkce();

      reply.setCookie(OAUTH_STATE_COOKIE, `${state}.${verifier}`, {
        path: '/api/auth',
        httpOnly: true,
        sameSite: 'lax',
        secure: config.nodeEnv === 'production',
        signed: true,
        maxAge: OAUTH_STATE_TTL_SECONDS,
      });
      return reply.redirect(buildAuthorizationUrl(discovery, config, state, challenge), 302);
    });

    /** Provider redirects back here with ?code&state; on success a session cookie is set. */
    app.get('/api/auth/callback', async (request, reply) => {
      if (!config.oidcEnabled || !config.oidcIssuer) {
        return reply.code(503).send({ error: 'Single sign-on is not configured on this server' });
      }
      const { code, state } = request.query as { code?: string; state?: string };
      if (!code || !state) {
        return reply.code(400).send({ error: 'Missing code or state in callback' });
      }

      const rawState = request.cookies[OAUTH_STATE_COOKIE];
      const unsigned = rawState ? request.unsignCookie(rawState) : { valid: false, value: null };
      const [expectedState, verifier] = unsigned.valid ? (unsigned.value ?? '').split('.') : [];
      reply.clearCookie(OAUTH_STATE_COOKIE, { path: '/api/auth' });
      if (!expectedState || !verifier || expectedState !== state) {
        return reply.code(400).send({ error: 'Login state mismatch — please try again' });
      }

      try {
        const discovery = await discoverOidc(config.oidcIssuer);
        const user = await exchangeCodeForUserInfo(discovery, config, code, verifier);
        setSessionCookie(reply, config, user);
        return reply.redirect('/app', 302);
      } catch (err) {
        if (err instanceof OidcError) {
          request.log.warn({ err }, 'OIDC login failed');
          return reply.code(502).send({ error: 'Sign-in failed — please try again' });
        }
        throw err;
      }
    });

    app.post('/api/auth/logout', async (_request, reply) => {
      clearSessionCookie(reply);
      return reply.code(204).send();
    });
  };
}

/**
 * preHandler that gates a route behind a signed-in session when AUTH_REQUIRED is on.
 * No-op when auth is disabled/unconfigured, so development stays zero-setup.
 */
export function requireAuth(config: AppConfig) {
  return async function authGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!config.authRequired || !config.oidcEnabled) return;
    if (getSessionUser(request) === null) {
      await reply.code(401).send({ error: 'Sign in to generate patterns' });
    }
  };
}

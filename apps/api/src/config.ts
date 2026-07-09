import { randomBytes } from 'node:crypto';
import { z } from 'zod';

/** Dev/test default for the public origin; treated as "unset" when validating production. */
const PUBLIC_URL_DEFAULT = 'http://localhost:4000';

/**
 * All runtime configuration, read once from the environment and validated. Tests can pass
 * overrides to `buildServer` instead of mutating `process.env`.
 */
const ConfigSchema = z.object({
  nodeEnv: z.enum(['development', 'test', 'production']).default('development'),
  port: z.coerce.number().int().min(0).max(65535).default(4000),
  host: z.string().default('0.0.0.0'),
  logLevel: z.string().default('info'),

  /** Secret used to sign session/state cookies. REQUIRED in production. */
  sessionSecret: z.string().min(32).optional(),

  /**
   * OIDC single sign-on. Configure all three to enable login (works with any standard OIDC
   * provider — Google, Microsoft Entra, Okta, Auth0, Keycloak, ...). Unset = auth disabled.
   */
  oidcIssuer: z.url().optional(),
  oidcClientId: z.string().min(1).optional(),
  oidcClientSecret: z.string().min(1).optional(),
  /** Where the provider redirects back to; defaults to `${publicUrl}/api/auth/callback`. */
  oidcRedirectUri: z.url().optional(),

  /** Public origin of the deployed app (used for auth redirects), e.g. https://knit.example.com */
  publicUrl: z.url().default(PUBLIC_URL_DEFAULT),

  /** When true, pattern/export endpoints require a signed-in session (needs OIDC configured). */
  authRequired: z.coerce.boolean().default(false),

  /** Requests per minute per IP on the compute-heavy endpoints. */
  rateLimitMax: z.coerce.number().int().min(1).default(60),

  /** Directory of the built frontend to serve in production ('' disables static serving). */
  staticRoot: z.string().default(''),

  /** Where the SQLite database lives (':memory:' for tests). */
  dataDir: z.string().default(''),
});

export type AppConfig = z.infer<typeof ConfigSchema> & {
  /** True when issuer, client id, and client secret are all present. */
  oidcEnabled: boolean;
  /** Effective redirect URI. */
  redirectUri: string;
  /** Effective session secret (ephemeral one generated outside production). */
  effectiveSessionSecret: string;
  /** Effective SQLite location (tests default to in-memory; otherwise ./data). */
  effectiveDataDir: string;
};

export class ConfigError extends Error {}

export function loadConfig(overrides: Partial<z.input<typeof ConfigSchema>> = {}): AppConfig {
  const parsed = ConfigSchema.safeParse({
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT,
    host: process.env.HOST,
    logLevel: process.env.LOG_LEVEL,
    sessionSecret: process.env.SESSION_SECRET,
    oidcIssuer: process.env.OIDC_ISSUER,
    oidcClientId: process.env.OIDC_CLIENT_ID,
    oidcClientSecret: process.env.OIDC_CLIENT_SECRET,
    oidcRedirectUri: process.env.OIDC_REDIRECT_URI,
    publicUrl: process.env.PUBLIC_URL,
    authRequired: process.env.AUTH_REQUIRED,
    rateLimitMax: process.env.RATE_LIMIT_MAX,
    staticRoot: process.env.STATIC_ROOT,
    dataDir: process.env.DATA_DIR,
    ...stripUndefined(overrides),
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new ConfigError(
      `Invalid configuration: ${first ? `${first.path.join('.')}: ${first.message}` : 'unknown'}`,
    );
  }
  const cfg = parsed.data;

  const oidcEnabled = Boolean(cfg.oidcIssuer && cfg.oidcClientId && cfg.oidcClientSecret);

  if (cfg.nodeEnv === 'production') {
    if (!cfg.sessionSecret) {
      throw new ConfigError('SESSION_SECRET (>= 32 chars) is required in production');
    }
    // publicUrl drives auth redirects and the production CORS allow-list. Leaving it at the
    // localhost default in production silently breaks sign-in and cross-origin calls, so fail
    // fast instead of shipping a misconfigured origin.
    if (cfg.publicUrl === PUBLIC_URL_DEFAULT) {
      throw new ConfigError('PUBLIC_URL must be set to the public origin in production');
    }
    if (cfg.authRequired && !oidcEnabled) {
      throw new ConfigError(
        'AUTH_REQUIRED=true needs OIDC_ISSUER, OIDC_CLIENT_ID, and OIDC_CLIENT_SECRET',
      );
    }
  }

  return {
    ...cfg,
    oidcEnabled,
    redirectUri: cfg.oidcRedirectUri ?? `${cfg.publicUrl.replace(/\/$/, '')}/api/auth/callback`,
    // Outside production a missing secret gets an ephemeral one (sessions reset on restart).
    effectiveSessionSecret: cfg.sessionSecret ?? randomBytes(32).toString('hex'),
    effectiveDataDir: cfg.dataDir || (cfg.nodeEnv === 'test' ? ':memory:' : './data'),
  };
}

function stripUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

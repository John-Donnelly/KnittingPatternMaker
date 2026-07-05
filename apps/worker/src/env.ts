/**
 * Worker environment bindings and config. Cloudflare injects vars/secrets/bindings per
 * request; this module normalizes them into the same shape the Fastify app's config had.
 *
 * Booleans are parsed from explicit 'true'/'false' STRINGS — never coercion, where the
 * string 'false' would be truthy.
 */

export interface Env {
  /** D1 database (accounts + saved patterns). */
  DB: D1Database;
  /** Static assets (the built frontend) — served automatically; binding kept for fallbacks. */
  ASSETS: Fetcher;

  /** Secret: >= 32 chars; signs session/state cookies. Required for auth features. */
  SESSION_SECRET?: string;
  /** OIDC single sign-on (any standard provider). All three required to enable login. */
  OIDC_ISSUER?: string;
  OIDC_CLIENT_ID?: string;
  /** Secret. */
  OIDC_CLIENT_SECRET?: string;
  OIDC_REDIRECT_URI?: string;
  /** Public origin, e.g. https://knit.example.com — drives the default redirect URI. */
  PUBLIC_URL?: string;
  /** 'true' to require sign-in for pattern generation/export. */
  AUTH_REQUIRED?: string;
}

export interface WorkerConfig {
  sessionSecret: string | undefined;
  oidcIssuer: string | undefined;
  oidcClientId: string | undefined;
  oidcClientSecret: string | undefined;
  publicUrl: string;
  redirectUri: string;
  authRequired: boolean;
  oidcEnabled: boolean;
}

let warnedMissingSecret = false;

export function loadConfig(env: Env): WorkerConfig {
  const publicUrl = (env.PUBLIC_URL ?? 'http://localhost:8787').replace(/\/$/, '');
  // Sign-in needs BOTH the OIDC trio and a session secret to sign cookies with. Workers
  // have no startup validation hook (unlike the Node server, which fails fast), so a
  // missing SESSION_SECRET must degrade coherently: auth reports as unavailable instead of
  // rendering a Sign-in button that 503s on every click.
  const oidcVarsPresent = Boolean(env.OIDC_ISSUER && env.OIDC_CLIENT_ID && env.OIDC_CLIENT_SECRET);
  const oidcEnabled = oidcVarsPresent && Boolean(env.SESSION_SECRET);
  if (oidcVarsPresent && !env.SESSION_SECRET && !warnedMissingSecret) {
    warnedMissingSecret = true;
    console.warn(
      'OIDC vars are set but SESSION_SECRET is missing — sign-in is disabled. Run: wrangler secret put SESSION_SECRET',
    );
  }
  return {
    sessionSecret: env.SESSION_SECRET,
    oidcIssuer: env.OIDC_ISSUER,
    oidcClientId: env.OIDC_CLIENT_ID,
    oidcClientSecret: env.OIDC_CLIENT_SECRET,
    publicUrl,
    redirectUri: env.OIDC_REDIRECT_URI ?? `${publicUrl}/api/auth/callback`,
    // Intentionally NOT gated on oidcEnabled: if the operator demanded sign-in but broke the
    // auth config, requests fail CLOSED with an explicit misconfiguration error (see
    // requireSessionIfConfigured) rather than silently opening the app to everyone.
    authRequired: env.AUTH_REQUIRED === 'true',
    oidcEnabled,
  };
}

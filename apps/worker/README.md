# Cloudflare Workers deployment

One Worker serves everything: the API (`/api/*`, Hono), the built frontend (Workers static
assets with SPA fallback), and D1 for accounts + saved patterns. `packages/core` runs
unchanged; images are decoded with WASM codecs (@jsquash) instead of sharp, and results are
**byte-identical** to the Node server (verified against the same inputs).

## Requirements

- A Cloudflare account with **Workers Paid** ($5/mo): the image pipeline uses 100–600 ms CPU
  per pattern, over the free plan's 10 ms cap. Paid includes 30M CPU-ms/month (~50k patterns).
- `npm run build` at the repo root first (the assets directory is `../web/dist`).

## First-time setup

```bash
cd apps/worker
npx wrangler login
npx wrangler d1 create knitting-pattern-maker    # copy database_id into wrangler.jsonc
npx wrangler d1 migrations apply DB --remote
npx wrangler secret put SESSION_SECRET           # >= 32 random chars
# Optional SSO (any OIDC provider):
#   set OIDC_ISSUER + OIDC_CLIENT_ID in wrangler.jsonc vars
npx wrangler secret put OIDC_CLIENT_SECRET
```

Set `PUBLIC_URL` in `wrangler.jsonc` to the deployed origin (custom domain or
`https://<name>.<account>.workers.dev`) and register `${PUBLIC_URL}/api/auth/callback` with
your identity provider. `AUTH_REQUIRED: "true"` gates generation behind sign-in.

## Deploy

```bash
npm run build            # repo root: core + api + web (assets)
npm run deploy:worker    # wrangler deploy
```

## Local development

```bash
npx wrangler d1 migrations apply DB --local
npm run dev:worker       # http://localhost:8787 (serves API + built SPA)
```

## Recommended WAF rate limits (dashboard → Security → WAF → Rate limiting)

- `POST /api/pattern`: 30 requests / minute / IP
- `POST /api/export/*`: 20 requests / minute / IP
- everything else `/api/*`: 120 requests / minute / IP

## Cost model (why Workers, not Containers)

Workers Paid is a $5/mo flat fee; D1 usage for this schema is pennies. ~30M included CPU-ms
covers ~50k pattern generations/month; overage ≈ $0.012 per 1,000 patterns. At £2.99/month a
single-digit subscriber count covers all infrastructure. Containers were rejected: ephemeral
disk still requires D1 anyway, the always-on floor is ~$12+/mo, and cold starts are
multi-second.

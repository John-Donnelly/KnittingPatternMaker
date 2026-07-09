# Knitting Pattern Maker

Turn any image (photo, drawing, or existing pixel art) into deterministic pixel art and a
complete, printable knitting pattern — chart, written row-by-row instructions, color legend
with yarn yardage estimate, and PDF/PNG export — sized to stitch counts you specify (optionally
gauge-aware, so the chart isn't visually stretched relative to what you'll actually knit).

**Every setting is optional.** By default, **auto mode** analyzes the image and picks the
technique, chart size, color count, sampling, and dithering for you — following standard
colorwork practice (2-colors-per-row Fair Isle, bobbin-count-aware intarsia; see
[docs/KNITTING_NOTES.md](docs/KNITTING_NOTES.md), "Auto mode") — and tells you what it chose
and why. Set any subset yourself and auto mode fills in only the rest.

Three techniques are supported: **stranded (Fair Isle) colorwork**, **intarsia**, and
**single-color knit/purl texture**. See [CHANGELOG.md](CHANGELOG.md) for what's landed so far,
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how it's built and why, and
[docs/KNITTING_NOTES.md](docs/KNITTING_NOTES.md) for the exact knitting conventions/assumptions
the pattern generators encode (chart reading direction, floats, bobbins, WS/RS stitch inversion,
gauge math, yardage estimate caveats).

## Monorepo layout

```
packages/core   deterministic image-quantization and pattern-generation algorithms (no I/O);
                shared by both the frontend and the backend so they can never disagree
apps/api        Fastify backend: image decoding, pattern assembly, PDF/PNG export
apps/web        React + Vite frontend: upload, configure, live preview, export, share links
docs/           architecture and domain-convention notes
```

## Requirements

- Node.js >= 20 (see `.nvmrc`)
- npm >= 10 (npm workspaces)

## Getting started

```bash
npm install
npm run build          # builds packages/core, then apps/api, then apps/web
npm test                # runs all workspace test suites
npm run dev:api          # starts the backend on http://localhost:4000
npm run dev:web          # starts the frontend on http://localhost:5173 (proxies /api to the backend)
```

Open the frontend URL and drop in an image — **Auto (recommended)** picks every setting from
the image and explains each choice; "Customize these settings" switches to manual controls
pre-filled with auto's picks. The preview updates automatically as you adjust. Working from a photo or JPEG of an existing chart? Switch
**Sampling** to _Dominant color_ to pull crisp flat colors out instead of muddy averaged ones
(see [docs/KNITTING_NOTES.md](docs/KNITTING_NOTES.md)). Download a PDF/PNG or copy a shareable
link once you're happy with it. A shared link is fully self-contained: opening one renders the
exact same pattern without needing the original image or a live backend.

## Scripts (root)

| Script              | Purpose                                  |
| ------------------- | ---------------------------------------- |
| `npm run build`     | Build all workspaces in dependency order |
| `npm test`          | Run all workspace test suites            |
| `npm run lint`      | ESLint across the whole repo             |
| `npm run format`    | Prettier write                           |
| `npm run typecheck` | TypeScript project-wide type checking    |
| `npm run dev:api`   | Backend dev server (tsx watch)           |
| `npm run dev:web`   | Frontend dev server (Vite)               |

## API

| Endpoint               | Body                                                                                                                   | Returns                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `POST /api/pattern`    | multipart: `image` file + optional `options` JSON (every field optional — unset fields are auto-chosen from the image) | the full computed pattern (grid, instructions, yardage, share link, `resolvedOptions` + `autoDecisions`) |
| `POST /api/export/pdf` | JSON: `{ technique, gauge?, grid }`                                                                                    | `application/pdf`                                                                                        |
| `POST /api/export/png` | JSON: `{ technique, gauge?, grid }`                                                                                    | `image/png` (chart only)                                                                                 |

Auth routes (active when SSO is configured): `GET /api/auth/login` (redirects to the identity
provider), `GET /api/auth/callback`, `POST /api/auth/logout`, `GET /api/auth/me`.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full request/response shapes and the
pipeline each endpoint runs.

## Deployment

Two supported targets, same API contract and byte-identical pattern output:

- **Cloudflare (recommended for production)** — a single Worker serves the API (Hono), the
  built SPA (static assets), and D1 storage; images decode via WASM codecs. See
  [apps/worker/README.md](apps/worker/README.md) for setup, deploy, cost model, and WAF
  rate-limit suggestions.
- **Docker / any Node host** — the Fastify API serves the built frontend (landing page at
  `/`, the maker at `/app`) alongside `/api`. Security headers (helmet + CSP), per-IP rate
  limiting, upload size limits, and redacted logging are on by default.

```bash
cp .env.example .env      # fill in SESSION_SECRET (and OIDC_* for sign-in)
docker compose up --build # serves everything on http://localhost:4000
```

Configuration is environment-driven and validated at startup — see [.env.example](.env.example)
for every variable. Highlights:

- `SESSION_SECRET` — required in production (>= 32 chars); signs the session cookies.
- `OIDC_ISSUER` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` — enable **single sign-on** with any
  standard OIDC provider (Google, Microsoft Entra, Okta, Auth0, Keycloak, ...). Register
  `${PUBLIC_URL}/api/auth/callback` as the redirect URI with your provider. Sessions are
  stateless signed cookies (authorization-code + PKCE flow; no token ever reaches the browser).
- `AUTH_REQUIRED=true` — gate pattern generation/export behind sign-in. With it unset (or SSO
  unconfigured), the app runs fully anonymously — including local development, which needs no
  auth setup at all.
- `PUBLIC_URL` — the deployed origin; drives CORS and the default OIDC redirect URI.

Run behind TLS (a reverse proxy or your platform's ingress) — session cookies are marked
`Secure` in production.

### Accounts & saved patterns

Signing in (SSO) gives each user a pattern library: **Save pattern** stores the pattern's
self-contained share-spec token server-side (SQLite at `DATA_DIR`, `apps/api/src/db.ts`), and
**My patterns** lists/opens/deletes them. `POST/GET/DELETE /api/patterns[...]` — all
session-gated, per-user isolated, capped at 200 patterns per account.

### Stripe integration points

Payments are deliberately **not** wired yet, but the seams are in place so an integration
only touches three spots:

1. **Accounts**: the `users` table already carries `plan` (default `'free'`) and
   `stripe_customer_id`; `GET /api/auth/me` returns `plan` to the frontend.
2. **Checkout**: add a session-gated `POST /api/billing/checkout` that creates a Stripe
   Checkout Session (`STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` are already stubbed in
   `.env.example`) and stores `stripe_customer_id` on the user row.
3. **Webhook**: add `POST /api/billing/webhook` (verify with `STRIPE_WEBHOOK_SECRET`) that
   flips `users.plan` on `checkout.session.completed` / subscription events. Gate premium
   features by reading `plan` where `requireAuth` already runs.

## License & privacy

Proprietary — © 2026 JAD Apps, all rights reserved. See [LICENSE](LICENSE).

[PRIVACY.md](PRIVACY.md) describes how the Service handles data: uploaded images are processed in
memory and never stored, there is no analytics or third-party tracking, and accounts/saved
patterns exist only when SSO sign-in is enabled. A few operational placeholders (contact email,
hosting region, jurisdiction) must be filled in before publishing it.

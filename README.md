# Knitting Pattern Maker

Turn any image (photo, drawing, or existing pixel art) into deterministic pixel art and a
complete, printable knitting pattern — chart, written row-by-row instructions, color legend
with yarn yardage estimate, and PDF/PNG export — sized to stitch counts you specify (optionally
gauge-aware, so the chart isn't visually stretched relative to what you'll actually knit).

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

Open the frontend URL, drop in an image, and adjust the technique/dimensions/gauge/colors —
the preview updates automatically. Working from a photo or JPEG of an existing chart? Switch
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

| Endpoint               | Body                                     | Returns                                                             |
| ---------------------- | ---------------------------------------- | ------------------------------------------------------------------- |
| `POST /api/pattern`    | multipart: `image` file + `options` JSON | the full computed pattern (grid, instructions, yardage, share link) |
| `POST /api/export/pdf` | JSON: `{ technique, gauge?, grid }`      | `application/pdf`                                                   |
| `POST /api/export/png` | JSON: `{ technique, gauge?, grid }`      | `image/png` (chart only)                                            |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full request/response shapes and the
pipeline each endpoint runs.

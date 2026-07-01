# Knitting Pattern Maker

Turn any image (photo, drawing, or existing pixel art) into deterministic pixel art and a
complete, printable knitting pattern — chart, written row-by-row instructions, yarn estimate,
and PDF/PNG export — sized to stitch counts you specify (optionally gauge-aware).

> Status: early scaffold. See [CHANGELOG.md](CHANGELOG.md) for what's landed so far.

## Monorepo layout

```
packages/core   deterministic image-quantization and pattern-generation algorithms (no I/O)
apps/api        Fastify backend: image processing, pattern assembly, PDF/PNG export
apps/web        React + Vite frontend: upload, crop, configure, preview, export
docs/           architecture and domain-convention notes
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the determinism strategy and gauge math,
and [docs/KNITTING_NOTES.md](docs/KNITTING_NOTES.md) for the knitting conventions/assumptions
the pattern generators encode (chart reading direction, floats, bobbins, etc.).

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

# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Monorepo scaffold: npm workspaces with `packages/core` (shared deterministic algorithms),
  `apps/api` (Fastify backend), and `apps/web` (React frontend).
- Shared TypeScript, ESLint (flat config), and Prettier configuration.
- Placeholder health-check endpoint and scaffold UI to prove the workspace wiring end to end.
- `packages/core` deterministic image pipeline: sRGB→CIE Lab conversion, perceptual nearest-color
  matching, median-cut color quantization, box-filter pixelation/downsampling, ordered (Bayer 4x4)
  and Floyd-Steinberg dithering, and gauge math (stitch aspect-ratio correction, finished-size
  estimate, aspect-aware suggested crop rect). 49 unit tests, including explicit
  same-input-same-output determinism checks for every stage.
- `packages/core` pattern generators for all three knitting techniques, sharing a common
  chart row-order convention (flat, bottom-up, RS rows read right-to-left / WS left-to-right —
  see `docs/KNITTING_NOTES.md`):
  - Stranded (Fair Isle) colorwork: run-length-encoded row instructions, long-float warnings
    (>5 stitches), and too-many-colors-per-row warnings.
  - Intarsia: row instructions plus a connected-region block/bobbin count.
  - Single-color knit/purl texture: 2-tone grayscale quantization and RS/WS-aware K/P
    instructions (a stitch's worked type inverts on WS rows to show correctly on the right side).
  - Yardage estimator (explicitly labeled as an approximation) and a stateless, self-contained
    shareable-link encoder/decoder (deflate + URL-safe base64, no server-side storage).

  46 additional unit tests (95 total), all with explicit determinism assertions.

- `apps/api` backend: a single deterministic pipeline (image decode via sharp -> crop -> pixelate
  -> quantize -> generate pattern -> estimate yardage -> encode share link) exposed as:
  - `POST /api/pattern` — multipart image + options in, full computed pattern out.
  - `POST /api/export/pdf` — a printable pattern (color legend with per-color yardage, a
    gauge-aspect-corrected chart that auto-tiles across pages when it won't fit legibly on one,
    row-by-row instructions, and technique-specific notes) from just a technique/gauge/grid
    (no re-upload or server-side storage needed).
  - `POST /api/export/png` — the chart alone as a standalone image.

  Zod-validated requests, sharp used only for format decoding (all resizing/quantization is
  `packages/core`'s own deterministic code, not libvips's). 12 integration tests covering
  success paths, determinism, and validation/corruption error cases.

- `apps/web` frontend: upload an image, tune technique/dimensions/gauge/colors/dithering/crop,
  and see a live preview (debounced calls to `/api/pattern`) — chart, color legend with
  per-color yardage, row-by-row instructions, and technique-specific notes (float/many-color
  warnings, bobbin count, or K/P key). Export via the same PDF/PNG endpoints, or copy a
  shareable link. Opening a shared link renders entirely client-side (`buildPatternResult`/
  `buildYardageEstimate`/`decodePatternSpec` all run in the browser via `packages/core`) with
  **no** `/api/pattern` call — confirmed by inspecting network traffic during manual testing.
  15 component/unit tests plus a full manual browser walkthrough (see Fixed, below) of all
  three techniques, both exports, the share-link round trip, and mobile/desktop layouts.

### Fixed

- `packages/core` median-cut quantization now splits a box at the largest **value** gap between
  consecutive sorted colors instead of the index-median. Index-median splitting balances sample
  _count_, which could merge two genuinely separated, far-apart colors (e.g. red and blue in a
  flat-color flag/logo image) into a muddy in-between color while slicing a real cluster in
  half. Found via manual end-to-end verification (rendered PDF/PNG) on a synthetic 3-stripe
  flag image, which is exactly the kind of flat-color, few-distinct-colors input this tool
  needs to handle well.
- `apps/web` chart canvas and crop preview used fixed pixel widths that overflowed narrow
  (mobile) viewports; both now scale to their container (`max-width: 100%`, percentage-based
  crop overlay) instead of a hardcoded display width. Found via manual mobile-viewport testing.
- `packages/core`'s share-link decoder (`decodePatternSpec`) processes untrusted input — anyone
  can hand-craft a link — but had no upper bound on the encoded token length or on grid
  dimensions after decoding, and decompressed into an unbounded buffer. A small, highly
  repetitive payload could therefore expand to tens of megabytes (or more) during
  decompression. Fixed by capping the encoded token length up front, decompressing into a
  fixed-size buffer (so oversized input truncates and fails validation instead of growing
  unbounded), and re-validating grid dimensions against the same `MAX_GRID_DIMENSION` bound the
  rest of the app uses. Also closed a matching gap in `apps/api`'s export request schema, which
  validated `grid.indices` length but not `grid.palette` length, so a crafted export request
  could ask for an arbitrarily large color legend. `MAX_GRID_DIMENSION`/`MAX_COLORS` moved from
  being duplicated in `apps/api` and `apps/web` into a single `packages/core/src/limits.ts`.

### Docs

- Added `docs/ARCHITECTURE.md` (monorepo layout, request flow, determinism strategy, shareable
  links, PDF/PNG export, testing approach, known limitations) and `docs/KNITTING_NOTES.md` (the
  exact knitting conventions the generators encode — chart reading order, floats, bobbins,
  WS/RS stitch inversion, gauge math, yardage caveats, quantization approach), both already
  referenced from the UI and PDF output. Rewrote `README.md` to describe the working app
  instead of the original scaffold.
- An independent review pass over the full codebase (against the docs' own claims) found that
  `decodePatternSpec` validated grid dimensions, indices, and palette length/index range, but
  never validated the gauge or palette RGB channel values from a shared link. A crafted link
  with e.g. `stitchesPer4In: 0` reached `stitchAspectRatio`, which explicitly throws on a
  non-positive gauge — uncaught, that broke the shared-pattern page entirely. Now validated
  with the same bounds the HTTP API's zod schema uses (positive, ≤ 200; palette channels
  0–255 integers; palette length ≤ MAX_COLORS). 6 new tests.

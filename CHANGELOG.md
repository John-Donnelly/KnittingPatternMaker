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

# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Pattern repetition (tiling)** — the core workflow's missing half. Previously the `seamless`
  option only _blended a single motif's edges_ so it _could_ tile; it never actually laid down
  the copies. Now `repeat.across` / `repeat.down` tile the motif into the final chart
  (`tileGrid`, `packages/core/src/image/tileGrid.ts`): `widthStitches`/`heightRows` size one
  motif, and the pipeline quantizes that single motif then repeats the **quantized index grid**
  so every copy is byte-identical (no per-tile drift). The final chart, instructions, yardage,
  and PDF are all generated from the tiled result. Bounded so `motif × repeat` can't exceed the
  max grid dimension (zod-validated). Verified end-to-end on the real forest JPEG: a 34×68 tree
  motif repeated 4× horizontally into a seamless 136×68 forest border.

### Changed

- **Seamless is now directional** (`none` / `horizontal` / `vertical` / `both`) instead of a
  single both-axes checkbox, so you can blend only the edges you're actually repeating —
  `horizontal` for a side-by-side border, `both` for an allover repeat (`seamlessModeToOptions`
  maps the mode to the per-axis blend flags). API: `seamless` changed from `boolean` to the mode
  enum, and `POST /api/pattern` now accepts `repeat` and echoes back `repeat` + `motif`. UI:
  the seamless checkbox became a "Repeat & tiling" sub-panel with across/down counts and a
  seamless-join direction select. 10 new core tests (`tileGrid`, mode mapping) + 2 API
  integration tests (tiling dimensions/identity, over-limit rejection) + updated web control
  tests.

- **Dominant-color sampling** — a selectable `sampling` mode (`average` default, or `dominant`)
  that extracts crisp pixel art from a source that isn't clean flat-color art (a photo,
  screenshot, or JPEG of a chart/logo). Where the default box-filter averages every source pixel
  in a cell — blending thin grid lines, anti-aliased edges, and JPEG ringing into muddy
  intermediate colors — dominant sampling groups the cell's pixels into 16-value buckets, takes
  the modal bucket, and returns the true mean of just that bucket, so outlier pixels are rejected
  and each cell reads as the flat color that actually fills it
  (`packages/core/src/image/dominantSample.ts`, dispatched via `sampleImage`). Wired through
  `/api/pattern` (`sampling` option) and the UI (a Sampling dropdown with mode-specific guidance).
  Extracted the shared, deterministic cell-boundary math into `cellBounds.ts` so both samplers
  partition the crop identically (existing `pixelate` tests confirm the refactor is behavior-
  preserving). Verified on the user's real 508×664 JPEG forest chart: dominant sampling kept the
  sky **pure white** (averaging muddied it to gray `#c9cac9`) and cut the intarsia bobbin count
  from 930 to 444. 12 new core tests + 2 API integration tests (exact flat-color recovery,
  outlier rejection, tie-breaking, determinism) + 1 web control test.

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
- **Seamless tiling** (`packages/core/src/image/seamless.ts`, `makeSeamless`): an opt-in option
  that makes the pixelated grid repeatable in both directions using the standard "offset +
  blend" technique — each axis is circularly shifted by half its length (relocating the
  wrap-around seam to the middle, where already-locally-continuous original content lands at
  the new edges) and the relocated seam is cross-faded over a symmetric band. Applied to the
  pixelated grid before quantization, so the blend band is measured in stitches. Wired through
  `/api/pattern` (`seamless` option, echoed in the response) and `/api/export/pdf` (prints a
  "tiles seamlessly" note when set); the UI exposes it as a single checkbox applying both axes.
  9 hand-verified core unit tests (including an exact hand-computed blend result) plus 2 API
  integration tests. Manually verified end-to-end: a synthetic ramp image with a 176-value hard
  edge at the wrap boundary produced _exactly matching_ quantized colors at both edges after
  enabling seamless mode (verified via direct grid comparison and by reading the rendered PDF).

### Changed

- **Seamless tiling rewritten to preserve the design and handle almost any input.** The first
  implementation used the classic "offset + blend" technique: it circularly shifted the image
  by half its length and cross-faded the relocated seam — which lands **in the middle of the
  picture**, smearing a band right through the subject, and only made the tiled edges as
  continuous as the source happened to be at its (former) center. `makeSeamless` now blends
  across the tile join itself and adapts to the content per row/column: the interior of the
  design is byte-identical to the input; each line's wrap mismatch is measured perceptually
  (CIE Lab) against the line's own stitch-to-stitch contrast, so already-tileable content
  (solids, checkerboards, noise) is left completely untouched; lines with a real seam get a
  blend band sized to the jump's severity (capped at 25% of the axis, smoothed across
  neighboring lines), pulling edge stitches toward a bridge between two interior anchors with
  full weight at the join — which bounds the residual jump at the join for **any** input
  (anchor gap ÷ band width) instead of relying on the source being continuous somewhere.
  API/UI surface unchanged (same `seamless` flag). Test suite rewritten: 12 core tests with
  exact hand-computed expectations, including interior-untouched, checkerboard-skip,
  bounded-join-residual, and 2D both-axes cases.

### Fixed

- **Median-cut degenerated badly on smooth gradients (i.e. most photos).** The earlier
  largest-gap split fix (below) introduced its own failure mode: on content where every
  adjacent sorted color differs by about the same amount — a gradient, sky, skin, any smooth
  region — all gaps tie, the first one wins, and each split peels a one-sample sliver off one
  end of the box instead of halving it. A uniform 0→255 ramp quantized to 6 colors produced
  the palette [2, 11, 24, 37, 50, 158]: five near-black slivers and one giant box. Now a
  hybrid rule: split at the widest gap only when it is _dominant_ (≥ 2× the box's mean
  adjacent gap, ties broken toward the median index); otherwise fall back to the median split.
  The same ramp now yields [28, 71, 106, 145, 180, 227]. The flag/logo cluster behavior is
  unchanged (its dominant-gap test still passes). Found via end-to-end browser verification of
  the seamless-tiling rework against the live API; regression test added.
- `packages/core` median-cut quantization now splits a box at the largest **value** gap between
  consecutive sorted colors instead of the index-median. Index-median splitting balances sample
  _count_, which could merge two genuinely separated, far-apart colors (e.g. red and blue in a
  flat-color flag/logo image) into a muddy in-between color while slicing a real cluster in
  half. Found via manual end-to-end verification (rendered PDF/PNG) on a synthetic 3-stripe
  flag image, which is exactly the kind of flat-color, few-distinct-colors input this tool
  needs to handle well. (Superseded by the hybrid rule above.)
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
- **`npm run typecheck` never actually checked any workspace's `test/` directory.** Each
  workspace's `tsconfig.json` scopes `include` to `src` (needed so `apps/api`/`packages/core`'s
  build doesn't try to emit compiled output for test files outside `rootDir`), and the root
  `typecheck` script pointed straight at those build configs. Vitest itself doesn't type-check
  (it strips types via esbuild), so test files had _no_ type checking at all — this stayed
  invisible because it only surfaces as a missing-property/wrong-type error, and the code
  itself still ran fine. Caught it by hand while wiring up the seamless-tiling feature: adding
  a required field to `FormState` didn't produce the type error I expected in
  `ControlsPanel.test.tsx`. Fixed with a separate `tsconfig.typecheck.json` per workspace
  (`apps/api`, `packages/core`) that includes both `src` and `test` without the build config's
  `rootDir`/`outDir` constraints; `apps/web`'s config already had no such constraint, so it
  just needed `test` added to `include` directly. This also surfaced a real, previously-silent
  gap: `apps/api`'s test suite used `supertest` without `@types/supertest` installed, so several
  callback parameters were implicitly `any`.

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

# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Seamless joins upgraded to minimum-error-boundary-cut quilting** (Efros–Freeman seam
  step): the motif is oversampled with real continuation content past its edge and merged
  with the opposite edge along the best DP seam, so repeats join along natural content edges
  instead of a cross-faded band — visibly fewer artifacts on structured motifs. Deterministic;
  axes under 10 stitches keep the legacy blend. 6 new tests; verified on the tiled forest
  border.

- **Cloudflare Workers deployment** (`apps/worker`): one Worker serves the API (Hono), the
  built SPA (static assets, SPA fallback), and D1 storage; images decode via @jsquash WASM
  codecs with EXIF rotation (exifr) and a pre-decode 24-megapixel header check; sessions are
  Web Crypto HMAC cookies; PNG export uses a pure fflate encoder. Output verified
  **byte-identical** to the Node server under local workerd. Setup/deploy/cost docs in
  `apps/worker/README.md` ($5/mo Workers Paid flat; ~50k patterns/month included).
- **Correctness fixes to the pattern text itself**: WS colorwork rows now read `P`, not `K`
  (following the old text literally produced garter stitch); texture charts no longer
  double-decode gamma (mid-grays stayed far too dark) and keep their two tones (the
  wool-shade merge could flatten a whole motif); stranded yardage now charges edge carries.
- **Professional PDF export**: pattern title + slug filenames, per-color chart symbols
  (B&W-print/colorblind-safe; dot-means-purl for texture), RS/WS row numbers on the correct
  sides, right-counted stitch numbers, every-10 guide lines, how-to-read box, finished size
  in in/cm, CYC yarn-weight suggestion, page footers.
- **First-run and trust polish**: bundled sample motifs, decode-failure messages (HEIC),
  client-side downscaling, landing pricing card (£2.99/month, free during early access),
  in-app chart-reading help, save/delete confirmations, AA contrast, aria-live statuses,
  mobile chart-first ordering.

- **Adaptive palette refinement — representative pixel art, only relevant colors.**
  Median-cut's two systematic failures were measured on real images (32×32 sprite at 8
  colors, averaged sampling: mean ΔE 13.7 vs source with 3 "phantom" palette entries that
  appear nowhere in the image; at 24×24, 7 of 8 entries were phantoms): `adaptivePalette`
  (`packages/core/src/color/refine.ts`) now post-refines every palette — reassign/recenter,
  snap entries to the exact dominant color of their cluster (flat art gets its true colors
  back; photo gradients keep means), merge ΔE<4 twins, prune negligible reabsorbable
  entries, re-spend freed slots on the worst cluster, and swap out mixture-of-two-entries
  artifacts for higher-gain splits. Accents survive by construction (1-stitch beaks and
  0.78%-coverage eye patches verified kept at full palettes). Bird sprite: ΔE 13.7 → 5.6,
  phantoms 3 → 0; a black/white chart asked for 4 colors now correctly yields 2. Linear-light
  averaging was evaluated and **rejected** by measurement (worse on 5 of 7 images; rationale
  in docs/KNITTING_NOTES.md). Runs before the wool-shade consolidation. 12 new tests.
- **Color fidelity for flat art in auto mode.** Busy flat-color art (sprite sheets) no longer
  falls into the busy-photo "stranded, 5 colors" fallback — which made a light-gray seagull
  dissolve into a sky-blue background entirely. Flat art keeps up to 10 colors in every
  technique branch, falling back to intarsia (high bobbin count warned) rather than losing
  part of the design.
- **Saved patterns + accounts.** Signing in gives each user a pattern library backed by
  SQLite (`DATA_DIR`, `apps/api/src/db.ts`): **Save pattern** stores the self-contained
  share-spec token; **My patterns** lists/opens/deletes (session-gated `/api/patterns` CRUD,
  per-user isolation, 200-pattern cap, tokens re-validated by decoding on save). The `users`
  table carries `plan` + `stripe_customer_id` and `GET /api/auth/me` returns `plan` — the
  prepared Stripe integration points are documented in the README (no payment flows are
  wired yet, deliberately). 5 API integration tests + 3 web component tests.
- **Upscaled-pixel-art detection.** Flat-color images whose every color edge sits on one
  lattice (integer-upscaled sprites) are mapped one stitch per underlying art pixel
  (`detectPixelLattice`) — verified on CC0 test sprites (512² → 64×64, 1216² → 32×32).
- **Knitting-themed UI.** Warm wool palette (cream/terracotta/sage), self-hosted Nunito
  variable font (CSP-safe), stitched dashed panel seams, pill buttons, yarn-ball favicon and
  branding, restyled landing page.

### Changed

- **Chart-grid detection rewritten as peak chaining.** The fixed-step pitch scan accumulated
  rounding drift across large scans (a 4096px-wide scan walked off its own grid) and required
  the grid to span the full image. Edge peaks are now chained by consistent spacing with the
  pitch derived from chain endpoints (drift-free), tolerating a missing line and cropping to
  the detected span. Validated against real freely-licensed charts; an autocorrelation
  fallback for very faint archival scans was prototyped and rejected (JPEG 8×8 block
  artifacts make ordinary photos look periodic — see docs/KNITTING_NOTES.md "Pictures of
  pixel grids" for the documented limitation).

### Fixed

- **Chart detection cropped the design's darkest rows off.** Grid lines over solid dark
  cells are much fainter than over light ones, so the peak chain ended ~5 rows early on a
  real forest chart and the output cut mid-motif (a truncated trunk row showed as an odd
  fringe along the bottom of tiled borders). Once the strong chain pins the pitch, the
  lattice now extends outward under a relaxed per-line test — locally distinct vs the
  half-pitch neighborhood plus an absolute energy floor so blank margins never extend.
  The forest chart recovers all 39×50 cells (was 39×45).
- **Side panel overflowed under the results column.** `<fieldset>` has
  `min-inline-size: min-content` and grid items refuse to shrink by default, so the controls
  fieldset overflowed its 320px column and overlapped the results text (visible in user
  screenshots). Both are now explicitly allowed to shrink, and the results column uses
  `minmax(0, 1fr)`.
- **"Use full image" could silently stretch the design.** Custom mode now shows a live
  warning with the distortion percentage when the chosen stitch grid's knitted aspect
  deviates >15% from the image's, with the fix spelled out.
- **Auto mode mangled pictures of existing charts.** A photo/scan of a chart _with grid
  lines_ (e.g. a 508×664 JPEG of a 38×50 forest chart) was classified as a photo: average
  sampling blended the grid lines into every cell and the ~10in default sizing (55×98) didn't
  align with the chart's ~13px cell pitch, so output cells straddled chart cells — smeared
  colors and spurious line artifacts. Auto mode now **detects the chart's own grid**
  (deterministic per-axis edge-energy pitch/phase search, `auto/gridDetect.ts`) and converts
  **one stitch per detected chart cell** with dominant sampling and a grid-aligned crop.
  Verified on the real forest chart: 38×50 stitches, 4 clean wool colors, cell-for-cell
  faithful to the source. 6 new tests (detection, false-positive rejection on photos/flat
  art, auto integration, user-override precedence).
- **Palettes offered several colors "one shade apart".** Median-cut on photographic input
  splits one perceived color into near-identical shades (measured on a real photo: four sky
  shades ΔE 4.5–9.4 apart at 120×120 / 8 colors) — impossible to buy as distinct yarns and the
  cause of banding contours ("lines") across smooth areas at larger chart sizes. Palettes are
  now consolidated after quantization: entries closer than ΔE 10 (CIE76) merge into one "wool
  color", weighted by stitch coverage so the dominant shade wins (transitive, deterministic;
  `consolidatePalette` in `packages/core/src/color/consolidate.ts`). The same photo now yields
  5 distinct colors (min pairwise ΔE ≈ 19). The palette can come out smaller than `maxColors`,
  which is correct — it reports how many genuinely distinct yarns the image needs. 7 new tests.
- **Chart preview showed moiré banding ("grid lines") on larger charts.** The canvas was drawn
  at its internal resolution and CSS-downscaled; non-integer resampling ratios produce periodic
  light/dark lines. The preview now sizes its backing store in device pixels from the actual
  container width and sets the CSS size to exactly backing/dpr, so the bitmap maps 1:1 onto
  device pixels and is never resampled (`computeChartLayout`, unit-tested across dprs); grid
  lines are drawn as crisp 1-device-pixel fills instead of fractional-width strokes.

### Added

- **Configurable shade grouping** — the wool-color merge threshold is now an option end to end:
  `shadeMergeDeltaE` on `POST /api/pattern` (0–50; 0 keeps every shade; unset uses the ΔE 10
  default) and a "Shade grouping" slider in the UI's custom controls, echoed back in
  `resolvedOptions`. Auto mode's technique evaluation uses the same threshold so what it
  measures matches what gets generated.
- **Landing page** at `/` (hero, feature overview, how-it-works) with the pattern maker moved
  to `/app` (tiny history-API router — share links keep working from any path). The header
  shows sign-in/sign-out state when SSO is configured.
- **Single sign-on (OIDC)** — `GET /api/auth/login` / `GET /api/auth/callback` /
  `POST /api/auth/logout` / `GET /api/auth/me`, implemented as a small, auditable
  authorization-code + PKCE flow against any standards-compliant provider (Google, Microsoft
  Entra, Okta, Auth0, Keycloak, ...) configured via `OIDC_ISSUER`/`OIDC_CLIENT_ID`/
  `OIDC_CLIENT_SECRET`. Sessions are stateless HMAC-signed httpOnly cookies (7-day expiry,
  `Secure` in production); no token ever reaches the browser. `AUTH_REQUIRED=true` gates
  pattern generation/export behind sign-in; with SSO unconfigured everything stays anonymous
  and dev needs zero auth setup. 8 integration tests (state mismatch, full round trip against
  a mocked provider, gating on/off).
- **Production readiness**: validated env-driven config (`src/config.ts`, fails fast on a
  missing `SESSION_SECRET` or half-configured auth in production), helmet security headers
  with a CSP, per-IP rate limiting on `/api` (`RATE_LIMIT_MAX`/min), cookie/authorization
  header redaction in logs, graceful SIGINT/SIGTERM shutdown, `/api/health`, and single-
  deployable static serving of the built frontend with an SPA fallback (`STATIC_ROOT`).
  Multi-stage `Dockerfile` (non-root, healthcheck) + `docker-compose.yml` + `.env.example`,
  documented in the README's new Deployment section.

- **Auto mode: every pattern option is now optional, and anything unset is chosen from the
  image itself.** `POST /api/pattern` accepts a partial (or entirely empty/omitted) `options`
  field; `resolveAutoOptions` (`packages/core/src/auto/`) analyzes the decoded image on a probe
  grid (flat-art vs photo, significant-color count, tonal richness, chroma) and fills in every
  unset field, validating technique choice against the _actual_ quantized stitch grid (per-row
  color counts, color blocks per row) — deterministic heuristics, no ML, so auto mode is exactly
  as reproducible and unit-testable as the rest of the pipeline. Choices conform to sourced
  colorwork conventions (see the new "Auto mode" section in `docs/KNITTING_NOTES.md`): stranded
  when rows stay ≤ 2 colors (Fair Isle practice) with a ≤ 5-color palette, intarsia when rows
  need more colors but stay ≤ 10 blocks wide (bobbin practicality), texture for near-grayscale
  images (with Floyd–Steinberg only when the source is tonally rich), dominant sampling for
  flat-color art vs averaging for photos, ~10 in finished width at the working gauge for sizing
  (small pixel-art sources map 1 stitch per pixel), and seamless blending matched to the repeat
  direction when a repeat is requested without an explicit seamless mode. The response reports
  `resolvedOptions` (the concrete settings used) plus `autoDecisions` (each auto-chosen field
  with a human-readable reason). UI: settings default to **Auto (recommended)**, showing what
  was picked and why, with a "Customize these settings" button that switches to the manual
  controls pre-filled with auto's choices. 17 new core tests, 3 API integration tests, 3 web
  component tests.

### Changed

- **Requesting a `repeat` without specifying `seamless` now auto-blends the joined edges** in
  the repeat direction(s) instead of defaulting to `none` — a repeated motif with visible seams
  is almost never what was wanted. Pass `seamless: "none"` explicitly to keep hard joins.

### Fixed

- **Repeat appeared "not to work" when `motif width × repeat` exceeded the 400-stitch grid
  limit.** The request failed validation, but `POST /api/pattern` returned a bare
  `"Invalid options"` and the frontend kept showing the last good chart — so changing "Repeat
  across" to 4 (with a 136-wide motif = 544) silently did nothing. Now: the zod refine messages
  are human-readable ("Final width (motif width × repeat across) exceeds the 400-stitch limit —
  reduce the width or the repeat-across count"), the route surfaces the first validation issue's
  message instead of a generic string, and the "Repeat & tiling" panel shows a **live final-size
  readout** ("Final chart: 544 × 40 stitches — over the 400 limit") in red before any request
  fires. Verified in the browser: within the limit, repeat tiles correctly (40 × repeat 4 →
  160-stitch chart); over the limit, the user now gets an immediate, specific explanation.

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

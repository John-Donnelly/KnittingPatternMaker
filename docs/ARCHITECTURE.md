# Architecture

## Monorepo layout

```
packages/core   Pure, dependency-light (only fflate) algorithms. No I/O, no Node- or
                browser-specific APIs beyond the isomorphic subset (TextEncoder/TextDecoder).
                Runs unmodified in both the backend (Node) and the frontend (browser via Vite).
apps/api        Fastify backend. The only place image *decoding* happens (via sharp/libvips).
apps/web        React + Vite frontend. Talks to apps/api for the authoritative pipeline; also
                imports packages/core directly for anything that doesn't need the original
                image bytes (share-link decode, gauge/crop math for the crop preview overlay).
```

`packages/core` is deliberately the single source of truth for every algorithm. Both apps
depend on it as a normal npm workspace package (not a copy), so there is exactly one
implementation of quantization, pattern generation, and yardage estimation — the frontend's
share-link view and the backend's PDF export both call the _same_ `buildPatternResult` /
`buildYardageEstimate` functions and are guaranteed to agree.

## Request flow

`POST /api/pattern` (multipart: an image file + a JSON `options` field) runs one pipeline,
end to end, per request:

```
sharp decode (EXIF-aware) -> crop -> pixelate -> [seamless blend, if requested] -> quantize
  -> generate pattern -> estimate yardage -> encode share link -> JSON response
```

The optional seamless-tiling step (`makeSeamless`) runs on the pixelated grid before
quantization, so the blend band is measured in stitches — see docs/KNITTING_NOTES.md.

sharp is used **only** to decode arbitrary image formats to a raw RGBA buffer (`apps/api/src/pipeline.ts`
`decodeImage`) — never for resizing or color reduction. That work is 100% `packages/core`, which
means the deterministic guarantees below don't depend on libvips's own (not contractually
stable-across-versions) resampling/quantization behavior.

`POST /api/export/pdf` and `POST /api/export/png` take a `{ technique, gauge?, grid }` body —
not an image — and regenerate the pattern instructions from the grid alone. This is possible
(and cheap) because pattern generation is a pure function of the grid; no re-processing of the
source image, and no server-side cache or database, is needed.

## Determinism strategy

The core promise of this tool is: the same image + the same options always produce the same
pixel grid, the same instructions, and the same exported files. Concretely:

- **No RNG anywhere** in the pipeline. Median-cut quantization is a deterministic geometric
  algorithm (see `docs/KNITTING_NOTES.md` for the exact splitting rule); dithering modes are
  either position-based (ordered/Bayer) or raster-order error diffusion (Floyd–Steinberg) —
  both are pure functions of pixel position/color, not randomized.
- **Fixed tie-breaking** everywhere a choice could otherwise be ambiguous: palette split
  ties break by channel evaluation order, nearest-color ties break by lowest palette index,
  box-selection ties break by insertion order. JavaScript's `Array#sort` has been stable since
  ES2019, which the median-cut split relies on.
- **Every stage has an explicit "same input twice -> same output" test**, not just a
  correctness test — see `packages/core/test/*.test.ts`, most of which include a dedicated
  `it('is deterministic', ...)` case, and the API integration tests
  (`apps/api/test/pattern.test.ts`) assert the same at the HTTP layer.

## Shareable links

A shared link encodes the _entire computed grid_ (technique, gauge, quantized palette, and
per-stitch indices) — not just the generation settings — as deflate-compressed JSON, base64url
encoded, in the URL fragment (`packages/core/src/pattern/shareState.ts`). Consequences:

- Opening a shared link reproduces the exact pattern with **no server round trip and no
  original image needed** — `apps/web` calls `decodePatternSpec` + `buildPatternResult` +
  `buildYardageEstimate` directly in the browser (verified manually: no `/api/pattern` request
  fires when loading a shared link).
- There is no database and nothing to host beyond the static frontend and the API — "stateless"
  by construction.
- The tradeoff is link length: very large/detailed patterns produce a longer link. For those,
  the PDF/PNG export is the better distribution mechanism.

## PDF export

`apps/api/src/export/pdf.ts` renders a full pattern: title/gauge summary, a color legend with
per-color yardage, the chart, row-by-row instructions, and technique-specific notes. The chart
uses cells proportioned by gauge (`stitchAspectRatio`) rather than the square cells some chart
software defaults to, so the printed picture is closer to what the finished piece will actually
look like. If the chart doesn't fit one page at a legible cell size, it's automatically tiled
across multiple pages (with row/column numbers on each tile) rather than shrinking to
illegibility or silently truncating — this keeps large patterns working rather than failing.

## PNG export

`apps/api/src/export/png.ts` renders the chart alone (square cells, gridlines every stitch with
a bolder line every 10) as a standalone image, cell size chosen to keep the output image within
a bounded pixel budget regardless of how large the requested grid is.

## Testing

- `packages/core`: unit tests per module, emphasizing determinism and hand-verified expected
  output (e.g. `strandedColorwork.test.ts` constructs a grid by hand and asserts the exact
  generated instruction text, not just "it doesn't throw").
- `apps/api`: integration tests over the real Fastify app (`supertest`), including a synthetic
  image fixture built with `sharp` at test time (no binary fixture files), covering success
  paths, determinism, and validation/corruption errors.
- `apps/web`: component tests (React Testing Library) for the non-trivial logic (form state,
  conditional rendering, the share-link codec), plus a full manual browser walkthrough with the
  real dev servers running (upload -> all three techniques -> both exports -> share-link
  round-trip across a page reload -> mobile/desktop layouts) before any UI change was
  considered done.

## Request-size and input-validation limits

All three endpoints validate with zod against shared bounds (`packages/core/src/limits.ts`):
grid dimensions and palette size are capped, and multipart uploads are capped to 25MB. The
share-link decoder additionally treats its input as untrusted (it's parsed straight from a URL
anyone could hand-craft): the encoded token is length-checked before decoding, decompression
writes into a fixed-size buffer rather than growing unbounded (so a decompression-bomb-style
link can't force a large allocation), and grid dimensions are re-validated after decoding even
though `encodePatternSpec` itself would never produce an out-of-range value.

## Known limitations

- **CORS is wide open** (`origin: true`) — fine for local development, but should be scoped to
  a specific origin before any public deployment.
- **No auth, rate limiting, or request logging beyond Fastify's default logger** — this is a
  personal/local tool, not hardened for running as a public multi-tenant service.
- Yardage estimates use a documented rough multiplier, not a real physical yarn model (see
  `docs/KNITTING_NOTES.md`).
- Nearest-color matching uses CIE76, not the more perceptually accurate CIEDE2000.
- The crop control offers only "auto" (gauge-aspect-correct, centered) or "full image" — no
  interactive pan/zoom to choose a different crop region.

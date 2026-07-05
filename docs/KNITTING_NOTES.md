# Knitting conventions and domain assumptions

This tool encodes a specific set of knitting conventions so it can generate instructions
deterministically. They're standard, common practice, but not universal — if your own habits
differ (e.g. you knit in the round, or read charts top-down), adjust accordingly. This document
exists so those assumptions are explicit and checkable, not buried in code.

## Chart reading order

- **Flat knitting, worked bottom-up.** Chart row 1 is the first row cast on/worked and sits at
  the **bottom** of the picture; the last chart row is worked last and sits at the **top**. The
  picture itself is stored top-to-bottom (like a normal image), so chart row `r` (1-indexed) of
  an `H`-row pattern corresponds to image row `H - r`.
- **Odd chart rows are RS (right side facing you); even rows are WS.** Charts are drawn as the
  fabric appears from the right side, so:
  - RS rows are read **right-to-left**.
  - WS rows are read **left-to-right**.

  This is why row 1 (RS, the bottom of the picture) lists stitches starting from the right edge
  of that row in the picture.

See `packages/core/src/pattern/chartOrder.ts` for the implementation and
`packages/core/test/chartOrder.test.ts` / `strandedColorwork.test.ts` for worked examples with
exact expected output.

## Colorwork stitch letters

Colorwork (stranded and intarsia) is assumed worked in flat **stockinette**: the written
instructions say `K` on RS rows and `P` on WS rows. The color sequence is what the chart
dictates; the stitch letter always matches the side being worked (knitting every WS row as
written-`K` would produce garter stitch instead).

## Stranded (Fair Isle) colorwork

- Practical stranded colorwork is worked with **at most 2 colors per row** — more than that
  requires impractically many floats. Rows with more colors than that get a (non-blocking)
  warning; the pattern still generates, since it may still be knittable with care (or better
  suited to intarsia).
- A **float** is the length a color is carried behind the work between two uses in the same row.
  Floats longer than **5 stitches** should be caught (twisted with the working yarn partway
  across) to avoid snagging; these are flagged as warnings with the exact stitch range.
- Every float (not just the long ones) contributes to that color's yardage estimate.

## Intarsia

- One **bobbin** is needed per maximal 4-connected region of a single color (a "block"): if a
  color appears in two regions that don't touch (even diagonally-adjacent doesn't count — only
  up/down/left/right), each needs its own bobbin. This is computed via flood fill over the
  final stitch grid and is a standard estimate for how many bobbins to prepare, though the
  exact number you use in practice can vary with technique.
- No floats: colors change directly at the boundary. Twist the old and new yarn around each
  other at every color change to avoid holes.

## Knit/purl texture (single color)

- The image is reduced to exactly **2 tones** (dark/light) using the same deterministic
  quantize/dither pipeline as the color techniques, applied to grayscale samples.
- Dark cells are rendered as a **purl bump** (relief) on the right side; light cells as a plain
  knit "V". Because stockinette alternates knit-RS/purl-WS by row, the _stitch you actually
  work_ must invert on WS rows to produce the correct RS appearance:

  | Cell tone              | RS row | WS row |
  | ---------------------- | ------ | ------ |
  | Light (flat knit look) | K      | P      |
  | Dark (purl bump)       | P      | K      |

  (A knit worked on a WS row reads as a purl bump on the RS, and vice versa — this is the same
  mechanism behind garter stitch and other relief patterns.) The generated instructions already
  apply this inversion; you can knit them literally row by row.

## Gauge and stitch proportions

- Knit stitches are not square — they're normally **wider than they are tall**. Ignoring this
  would make a pixel-accurate grid look visibly squashed once knitted.
- If you supply a gauge (stitches and rows per 4in/10cm), the tool computes the stitch
  width:height ratio from it and uses that ratio both to **suggest a crop** of the source image
  (so the pixelated result isn't stretched) and to **draw the chart** with proportional cells.
- If you don't supply a gauge, a default of 22 sts / 30 rows per 4in is assumed (an approximate
  worsted-weight stockinette tension) — still non-square, just not tailored to your yarn.

## Yardage estimates

- Yardage per color is a **rough approximation**: `4 × (stitch width + stitch height)` inches of
  yarn per stitch (a commonly used ballpark multiplier for stockinette), plus the extra length
  consumed by any floats for that color. It is explicitly not a precise physical model — actual
  usage depends on fiber, tension, and finishing. Always buy a margin over the estimate.

## Sampling (turning source pixels into stitch cells)

Before quantization, every source pixel that falls inside a stitch cell has to become one color.
There are two modes (`packages/core/src/image/`):

- **Average** (`pixelate.ts`, default): the box-filter mean of every covered pixel. Correct for
  photos and smooth gradients, where blending neighboring pixels is exactly what you want.
- **Dominant** (`dominantSample.ts`): the cell's **modal** color — group the covered pixels into
  16-value-per-channel buckets, pick the bucket with the most pixels, and return the true mean of
  just that bucket. This **rejects outlier pixels**: a thin grid line, an anti-aliased edge, or
  JPEG ringing is a minority of the cell and gets ignored, so each cell reads as the flat color
  that actually fills it.

Use **dominant** to pull crisp pixel art out of a source that isn't clean flat-color art — a
photo, screenshot, or JPEG of a chart/logo/pixel-art image. On a JPEG of an existing chart, the
grid lines and compression halos otherwise get averaged in: a white sky comes out muddy gray,
flat greens turn olive, and the extra intermediate colors fracture intarsia into far more color
blocks (more bobbins). Dominant sampling recovers the flat colors instead — verified on a real
508×664 JPEG chart, where it kept the sky pure white and roughly halved the intarsia bobbin count
versus averaging.

Caveats: dominant sampling is deliberately _not_ for photos (it posterizes smooth gradients into
blocky steps), and a genuinely distinct color that straddles a 16-value bucket boundary can have
its vote split — but the subsequent palette quantization absorbs that rare case. When downsampling
heavily, a few isolated stitches of a dark/saturated source color can still win their cell and read
as speckle; lowering the max-color count cleans those up.

Averaging happens in **gamma-encoded sRGB space on purpose**. Averaging in linear light is
physically more correct for simulating optics, but it was measured to be perceptually _worse_
here: on a multi-image evaluation set (pixel art, chart scans, photos), linear-light box
averaging increased the mean CIE76 ΔE between the sampled grid and the source on 5 of 7
images (worst case a black-on-white chart, 13.4 → 17.5, because linear averaging biases
dark/light mixes toward the light side and washes out dark line work). sRGB-space averaging
tracks Lab lightness and keeps mixes visually centered.

## Color quantization

- Colors are reduced via **median-cut**, splitting each box at the **largest gap between
  sorted color values** (not the middle index) so that genuinely separated colors — e.g. the
  two colors of a flag or logo — don't get averaged into a color that doesn't exist in the
  source image. See `packages/core/src/color/quantize.ts`.
- The raw median-cut palette then passes through a deterministic **adaptive refinement**
  (`packages/core/src/color/refine.ts`) fixing median-cut's two systematic failures, both
  measured on real test images:
  - **Phantom blends**: anti-aliased edges and box-averaged cells produce colors _between_
    the real flat colors, and median-cut boxes can average them into palette entries that
    appear nowhere in the source (measured up to ~20 ΔE off — two black birds and a brown
    bird merging into one muddy dark-brown while a light-gray bird vanished into the sky).
    Refinement reassigns samples to their nearest entry, recenters each entry, and **snaps
    an entry to the exact color that dominates its cluster** (≥ 50% of stitches), so flat
    art gets its true colors back while photo gradients keep the mean.
  - **Wasted slots**: entries 1–2 ΔE apart get merged, sub-0.5%-coverage entries that can be
    reabsorbed nearby get pruned, and every freed slot is re-spent splitting the cluster
    with the largest weighted error. A full palette may also **swap** out an entry that is
    merely a mixture of two other entries (an edge-blend artifact, never a distinct accent)
    for a higher-gain split.
  - Small-but-important **accent colors survive by construction** (a 1-stitch beak
    reassigns only at a large ΔE, blocking the prune; an accent is never a blend of two
    other entries, blocking the swap) — verified on a 32×32 sprite at maxColors 8.
- Nearest-color matching uses **CIE76 distance in L\*a\*b\* space** (perceptually more accurate
  than raw RGB distance, though CIE76 itself is a simplification — CIEDE2000 would be more
  accurate still and is a possible future improvement).
- **Wool-color consolidation**: after median-cut, palette entries closer than **ΔE 10** (CIE76)
  are merged into a single color (`packages/core/src/color/consolidate.ts`), weighted by how
  many stitches each shade covers so the dominant shade wins. Median-cut on photographic
  input otherwise splits one perceived color (a sky, a skin tone) into several near-identical
  shades — colors no yarn shop distinguishes and no knitter wants to juggle. Merging is
  transitive, so a chain of near shades collapses together; the final palette can therefore
  come out _smaller_ than `maxColors`, which is correct: it reports the number of genuinely
  distinct yarns the image needs. The threshold is configurable (`shadeMergeDeltaE` in the API,
  the "Shade grouping" slider in the UI): raise it to group more aggressively, set 0 to keep
  every shade.
- Dithering (`none` / ordered "Bayer" / Floyd–Steinberg) is offered, but **`none` is the default
  and the recommendation for stranded/intarsia colorwork**: dithering scatters isolated single
  stitches of a color across the grid, which is impractical to knit as clean color regions.
  Dithering is more reasonable for the knit/purl texture technique, where isolated stitches are
  just fine texturally.

## Repeat & seamless tiling

The tool can take a single **motif** (the `widthStitches` × `heightRows` you specify) and
actually **repeat (tile)** it into the final chart — `repeat.across` copies wide and
`repeat.down` copies tall — with an optional **seamless join** so the copies flow into each
other with no visible seam. This is for allover colorwork, borders that wrap around a
hat/cuff/blanket, or any design meant to be worked as a repeating unit.

Two independent controls:

- **Repeat across / down** (`tileGrid`, `packages/core/src/image/tileGrid.ts`): how many times
  the motif is laid down. `1 × 1` is a single motif; `4 × 1` is four copies side by side. The
  final chart is `motif size × these counts` (capped so it stays within the max grid dimension).
  Tiling runs on the **quantized** index grid, so every copy is byte-identical — no per-tile
  quantization drift.
- **Seamless join** (`none` / `horizontal` / `vertical` / `both`): which of the motif's opposite
  edges to blend so the repeat loops cleanly. Match it to the direction(s) you're repeating —
  `horizontal` for a side-by-side border, `both` for an allover repeat. With `none`, the copies
  are laid down as-is and a hard edge may show at each join.

The row-by-row instructions and PDF are generated from the **already-tiled** chart, so you just
knit them straight through; each motif width/height simply repeats.

### How the seamless join works

Primary method — **minimum-error-boundary-cut quilting** (the seam step of Efros–Freeman
image quilting, `packages/core/src/image/quilt.ts`): the motif is sampled with a few extra
columns/rows of REAL continuation content from past its edge in the source, and a
dynamic-programming seam merges that continuation with the opposite edge along the path
where the two match best. The join follows natural edges in the content instead of
cross-fading a straight band across it, which removes the smearing artifacts of blending.
The seam path is constrained so the wrap flow is exact: the output's last column continues
into its first column exactly as the source content did. Axes under 10 stitches fall back
to the legacy adaptive blend below.

### How the seamless blend works

- Implementation (`packages/core/src/image/seamless.ts`): the two edges of each row (and/or
  column) are blended **across the tile join itself**, leaving the interior of the picture
  completely untouched. This deliberately avoids the classic "offset + blend" technique, which
  circularly shifts the image and cross-fades a band right through the _middle_ of the design —
  fine for abstract textures, ruinous for a picture with a subject in it.
- The blend is **content-adaptive, per row/column**, so it handles almost any input sensibly:
  - Each line's wrap-edge mismatch is measured perceptually (CIE Lab distance) and compared to
    the line's own average stitch-to-stitch contrast. Lines whose edges already read as
    continuous when tiled — solid colors, checkerboards, noise, anything high-frequency — are
    left **byte-identical to the input**, not needlessly smoothed.
  - Lines with a real seam get a blend band sized to the jump's severity (a gentle mismatch
    gets a 1–2 stitch touch-up; a hard edge gets a wider ramp), capped at 25% of the axis so
    the design always dominates. Band widths are smoothed across neighboring lines so the
    transition zone forms a coherent region rather than a ragged per-line comb.
  - Within the band, samples are pulled toward a straight "bridge" drawn between the two anchor
    stitches just outside the band, with full weight at the join and decaying weight toward the
    anchors. Because the two join-adjacent stitches come purely from the bridge, the residual
    jump at the tile join is **bounded and small for any input** (anchor gap ÷ band width), not
    merely "as continuous as the source happened to be somewhere".
- Applied to the motif (post-crop/sample, pre-quantize and pre-tile), not the original photo, so
  the blend band is measured in stitches and lines up with what actually ends up in the chart —
  and after quantization to a small palette, the near-matching join stitches usually land in
  the same color bucket, making the tiled edges match exactly.

## Auto mode

Every pattern option is optional; anything unset is chosen from the image by
`resolveAutoOptions` (`packages/core/src/auto/`). The choices are deterministic heuristics —
no ML, no randomness — validated against the _actual_ quantized stitch grid using the same
pure functions the final pattern is built from, and each choice is reported back with a
human-readable reason. The defaults encode published colorwork conventions:

- **Technique.** Traditional Fair Isle is worked with **at most 2 colors per row** and a
  **4–5 color total palette** ([Wikipedia: Fair Isle](<https://en.wikipedia.org/wiki/Fair_Isle_(technique)>),
  [Knit Picks Fair Isle guide](https://www.knitpicks.com/learning-center/fair-isle-knitting-guide));
  intarsia suits **large solid color blocks** and gets impractical past roughly **10
  simultaneous bobbins** ([Nimble Needles: intarsia tips](https://nimble-needles.com/tutorials/advanced-intarsia-knitting-10-tips/),
  [intarsia vs Fair Isle](https://nimble-needles.com/tutorials/intarsia-knitting-vs-fair-isle/)).
  Auto mode therefore quantizes a candidate grid and measures it: if ≥ 75% of rows use ≤ 2
  colors it picks **stranded** (palette capped at 5); otherwise, if no row needs more than 10
  color blocks, it picks **intarsia** (palette capped at 10); busier, photo-like content falls
  back to stranded with a small palette (floats degrade better than hundreds of bobbins, and
  over-2-color rows are flagged). Near-grayscale images (mean Lab chroma < 6) map to
  **knit/purl texture** instead.
- **Size.** Popular chart tools default to ~48–100-stitch widths (knitPro's "Regular" grid is
  48×64, [microrevolt.org/knitPro](https://www.microrevolt.org/knitPro/); Stitchboard caps free
  charts at 100). Auto mode targets a **~10 in finished width at the working gauge** (55
  stitches at the default 22 sts/4 in), with rows derived from the image's aspect ratio
  corrected for non-square stitches. Small flat-color sources (≤ 120 px per side) are instead
  mapped **1 stitch per pixel**, so existing pixel art comes through exactly.
- **Pictures of pixel grids.** Two deterministic detectors (`packages/core/src/auto/gridDetect.ts`)
  recognize images that are pictures OF a cell grid and convert them **one stitch per
  underlying cell** (resampling at an unrelated stitch count would smear every output cell
  across cell boundaries):
  - _Grid-line charts_ (photo/scan/screenshot of a knitting or cross-stitch chart with
    visible grid lines): edge peaks are chained by consistent spacing; the pitch comes from
    the chain endpoints, so it cannot drift across large scans, and margins outside the
    chart are cropped away. Verified on a real 508×664 chart JPEG (38×50 cells) and a
    1722×1067 filet-crochet chart (42×26 cells).
  - _Upscaled pixel art_ (no grid lines): if every color edge sits on multiples of one
    art-pixel size, the native art dimensions are recovered (verified on 512² and 1216²
    CC0 sprites → 64×64 / 32×32 stitches). Flat-color images try this test first; a clean
    gridded chart passes it with the same answer.
  - _Known limitation (deliberate)_: heavily aged or hand-painted archival scans (tested on
    three 4096px 19th-century Berlin wool work sheets) have grids too faint/warped for
    either detector — and an autocorrelation fallback was evaluated and **rejected** because
    JPEG 8×8 block artifacts produce equally strong periodicity in ordinary photos, risking
    confidently wrong cell counts. Such scans fall back to photo treatment; set the
    width/height to the chart's true cell count manually for a 1:1 conversion.
- **Sampling.** Flat-color art (few significant colors, hardly any soft pixel-to-pixel
  transitions on a probe grid) gets **dominant** sampling; photographic content gets
  **average**. See "Sampling" above.
- **Dithering.** Off for colorwork — dithered speckle is impractical to knit as color regions
  ([OddKnit on chart design](http://www.oddknit.com/design/colour/chartdesign.html), and see
  "Color quantization" above). For texture charts of tonally rich sources (photos/gradients),
  Floyd–Steinberg is used so shading survives the 2-tone reduction as relief.
- **Seamless & repeat.** If a repeat is requested without an explicit seamless mode, the joined
  edges are blended in the repeat direction(s) — a visible seam on a deliberate repeat is
  almost never wanted. Pass `seamless: "none"` to keep hard joins.

The full request/response contract (`resolvedOptions`, `autoDecisions`) is described in
`docs/ARCHITECTURE.md`.

## Determinism

Every stage above — pixelation, quantization, dithering, pattern generation, yardage estimation,
and the shareable-link encoding — is a pure function with no random number generation and no
reliance on non-deterministic iteration order. The same image bytes and the same options always
produce byte-identical output. This is enforced by explicit "run it N times, compare" tests
throughout `packages/core/test/`, not just asserted in prose.

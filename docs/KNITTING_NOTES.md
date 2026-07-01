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

## Color quantization

- Colors are reduced via **median-cut**, splitting each box at the **largest gap between
  sorted color values** (not the middle index) so that genuinely separated colors — e.g. the
  two colors of a flag or logo — don't get averaged into a color that doesn't exist in the
  source image. See `packages/core/src/color/quantize.ts`.
- Nearest-color matching uses **CIE76 distance in L\*a\*b\* space** (perceptually more accurate
  than raw RGB distance, though CIE76 itself is a simplification — CIEDE2000 would be more
  accurate still and is a possible future improvement).
- Dithering (`none` / ordered "Bayer" / Floyd–Steinberg) is offered, but **`none` is the default
  and the recommendation for stranded/intarsia colorwork**: dithering scatters isolated single
  stitches of a color across the grid, which is impractical to knit as clean color regions.
  Dithering is more reasonable for the knit/purl texture technique, where isolated stitches are
  just fine texturally.

## Seamless tiling

Turning on "Seamless tiling" makes the pixelated grid repeatable — you can knit multiple copies
of the chart side by side and/or stacked, and the join won't show a hard seam. This matters for
allover colorwork motifs, borders that wrap around a hat/cuff, or blanket squares meant to be
worked in a grid.

- Implementation: the standard "offset + blend" technique (the same idea behind Photoshop's
  Offset filter + heal-the-seam workflow). Each axis is circularly shifted by half its length —
  which relocates the wrap-around seam to the middle of the grid and moves already-adjacent
  (already locally continuous) original content out to the new edges — then a symmetric band
  around the relocated seam is cross-faded to smooth out the discontinuity that used to be at
  the wrap boundary. See `packages/core/src/image/seamless.ts`.
- Applied to the pixelated grid (post-crop/pixelate, pre-quantize), not the original photo, so
  the blend band is measured in stitches and lines up with what actually ends up in the chart.
- **This does not guarantee the two new edges are byte-identical colors** — it guarantees they're
  as continuous as the source image already is at that (formerly central) point, which is the
  expected behavior of this technique on a real photo. In practice, because the result is then
  quantized down to a small palette, adjacent original pixels often do end up in the same color
  bucket and the tiled edges match exactly — but for images with a hard edge running through
  their own center, don't expect a perfect match.
- To actually knit a seamless repeat: cast on multiple widths of the chart's stitch count side
  by side for a horizontal repeat, and/or work the full chart height multiple times in a row for
  a vertical repeat, continuing the row-by-row instructions exactly as written each time (chart
  row 1 always starts a new repeat).

## Determinism

Every stage above — pixelation, quantization, dithering, pattern generation, yardage estimation,
and the shareable-link encoding — is a pure function with no random number generation and no
reliance on non-deterministic iteration order. The same image bytes and the same options always
produce byte-identical output. This is enforced by explicit "run it N times, compare" tests
throughout `packages/core/test/`, not just asserted in prose.

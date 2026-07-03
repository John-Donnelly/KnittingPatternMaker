import { z } from 'zod';
import { MAX_COLORS, MAX_GRID_DIMENSION } from 'knitting-pattern-core';

export const TechniqueSchema = z.enum(['stranded', 'intarsia', 'texture']);

export const DitherModeSchema = z.enum(['none', 'bayer4', 'floyd-steinberg']);

export const SamplingModeSchema = z.enum(['average', 'dominant']);

export const SeamlessModeSchema = z.enum(['none', 'horizontal', 'vertical', 'both']);

/** How many times to tile the motif. Bounded so the tiled result can't exceed MAX_GRID_DIMENSION
 * on either axis (also enforced against the actual motif size in PatternOptionsSchema). */
export const RepeatSpecSchema = z.object({
  across: z.number().int().min(1).max(MAX_GRID_DIMENSION),
  down: z.number().int().min(1).max(MAX_GRID_DIMENSION),
});

export const GaugeSpecSchema = z.object({
  stitchesPer4In: z.number().positive().max(200),
  rowsPer4In: z.number().positive().max(200),
});

export const CropRectSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
});

export const RgbSchema = z.object({
  r: z.number().int().min(0).max(255),
  g: z.number().int().min(0).max(255),
  b: z.number().int().min(0).max(255),
});

/**
 * Every field is optional: anything unset is chosen by auto mode from the image itself
 * (`resolveAutoOptions` in packages/core) and reported back in `resolvedOptions` /
 * `autoDecisions`. `{}` is a fully valid request.
 */
export const PatternOptionsSchema = z
  .object({
    technique: TechniqueSchema.optional(),
    /** Size of ONE motif tile (before any repetition). */
    widthStitches: z.number().int().min(1).max(MAX_GRID_DIMENSION).optional(),
    heightRows: z.number().int().min(1).max(MAX_GRID_DIMENSION).optional(),
    gauge: GaugeSpecSchema.optional(),
    maxColors: z.number().int().min(1).max(MAX_COLORS).optional(),
    dither: DitherModeSchema.optional(),
    /** How each cell samples the source pixels it covers — `dominant` extracts crisp pixel art
     * from a photo/JPEG of a chart by rejecting outlier pixels; see docs/KNITTING_NOTES.md. */
    sampling: SamplingModeSchema.optional(),
    crop: CropRectSchema.optional(),
    /** Which axes to blend so a repeated motif loops with no visible seam. */
    seamless: SeamlessModeSchema.optional(),
    /** How many times to tile the motif into the final chart (1x1 = a single motif). */
    repeat: RepeatSpecSchema.optional(),
  })
  .refine(
    (o) =>
      o.widthStitches === undefined ||
      o.widthStitches * (o.repeat?.across ?? 1) <= MAX_GRID_DIMENSION,
    {
      message: `Final width (motif width × repeat across) exceeds the ${MAX_GRID_DIMENSION}-stitch limit — reduce the width or the repeat-across count.`,
      path: ['repeat', 'across'],
    },
  )
  .refine(
    (o) => o.heightRows === undefined || o.heightRows * (o.repeat?.down ?? 1) <= MAX_GRID_DIMENSION,
    {
      message: `Final height (motif height × repeat down) exceeds the ${MAX_GRID_DIMENSION}-row limit — reduce the height or the repeat-down count.`,
      path: ['repeat', 'down'],
    },
  );
export type PatternOptions = z.infer<typeof PatternOptionsSchema>;

export const GridBodySchema = z.object({
  width: z.number().int().min(1).max(MAX_GRID_DIMENSION),
  height: z.number().int().min(1).max(MAX_GRID_DIMENSION),
  indices: z.array(z.number().int().min(0)).max(MAX_GRID_DIMENSION * MAX_GRID_DIMENSION),
  palette: z.array(RgbSchema).min(1).max(MAX_COLORS),
});

export const PatternSpecBodySchema = z
  .object({
    technique: TechniqueSchema,
    gauge: GaugeSpecSchema.optional(),
    grid: GridBodySchema,
    /** Informational only (the grid already has any seamless blending baked in) — lets the
     * PDF print a note that the pattern is designed to repeat. */
    seamless: z.boolean().optional(),
  })
  .refine((spec) => spec.grid.indices.length === spec.grid.width * spec.grid.height, {
    message: 'grid.indices length must equal grid.width * grid.height',
    path: ['grid', 'indices'],
  })
  .refine((spec) => spec.grid.indices.every((idx) => idx < spec.grid.palette.length), {
    message: 'grid.indices contains an index outside the palette range',
    path: ['grid', 'indices'],
  });
export type PatternSpecBody = z.infer<typeof PatternSpecBodySchema>;

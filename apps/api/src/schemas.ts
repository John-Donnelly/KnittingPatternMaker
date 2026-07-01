import { z } from 'zod';
import { MAX_COLORS, MAX_GRID_DIMENSION } from 'knitting-pattern-core';

export const TechniqueSchema = z.enum(['stranded', 'intarsia', 'texture']);

export const DitherModeSchema = z.enum(['none', 'bayer4', 'floyd-steinberg']);

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

export const PatternOptionsSchema = z.object({
  technique: TechniqueSchema,
  widthStitches: z.number().int().min(1).max(MAX_GRID_DIMENSION),
  heightRows: z.number().int().min(1).max(MAX_GRID_DIMENSION),
  gauge: GaugeSpecSchema.optional(),
  maxColors: z.number().int().min(1).max(MAX_COLORS).default(8),
  dither: DitherModeSchema.default('none'),
  crop: CropRectSchema.optional(),
});
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

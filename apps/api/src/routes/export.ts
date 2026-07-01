import type { FastifyInstance } from 'fastify';
import { buildPatternResult, buildYardageEstimate, deserializeGrid } from 'knitting-pattern-core';
import { PatternSpecBodySchema } from '../schemas.js';
import { renderPatternPdf } from '../export/pdf.js';
import { renderChartPng } from '../export/png.js';

export async function registerExportRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/export/pdf', async (request, reply) => {
    const parsed = PatternSpecBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid pattern spec', details: parsed.error.issues });
    }

    const { technique, gauge, grid: gridJson } = parsed.data;
    const grid = deserializeGrid(gridJson);
    const pattern = buildPatternResult(technique, grid);
    const yardage = buildYardageEstimate(grid, gauge, pattern);

    const pdfBytes = await renderPatternPdf({
      technique,
      grid,
      pattern,
      yardage,
      widthStitches: grid.width,
      heightRows: grid.height,
      ...(gauge ? { gauge } : {}),
    });

    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', 'attachment; filename="knitting-pattern.pdf"');
    return reply.send(Buffer.from(pdfBytes));
  });

  app.post('/api/export/png', async (request, reply) => {
    const parsed = PatternSpecBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid pattern spec', details: parsed.error.issues });
    }

    const grid = deserializeGrid(parsed.data.grid);
    const pngBuffer = renderChartPng(grid);

    reply.header('Content-Type', 'image/png');
    reply.header('Content-Disposition', 'attachment; filename="knitting-pattern-chart.png"');
    return reply.send(pngBuffer);
  });
}

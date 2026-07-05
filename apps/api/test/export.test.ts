import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';

function samplePatternSpecBody() {
  return {
    technique: 'stranded' as const,
    gauge: { stitchesPer4In: 22, rowsPer4In: 30 },
    grid: {
      width: 6,
      height: 6,
      indices: [
        0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 1,
        0, 1, 0, 1, 0,
      ],
      palette: [
        { r: 20, g: 20, b: 20 },
        { r: 235, g: 235, b: 235 },
      ],
    },
  };
}

describe('POST /api/export/pdf', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns a valid PDF for a stranded pattern', async () => {
    const res = await request(app.server)
      .post('/api/export/pdf')
      .send(samplePatternSpecBody())
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    const body: Buffer = res.body;
    expect(body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('renders intarsia and texture pattern specs too', async () => {
    for (const technique of ['intarsia', 'texture'] as const) {
      const body = { ...samplePatternSpecBody(), technique };
      const res = await request(app.server)
        .post('/api/export/pdf')
        .send(body)
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        });
      expect(res.status).toBe(200);
      expect((res.body as Buffer).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    }
  });

  it('survives a title with emoji/CJK (sanitized for the WinAnsi font, slugged filename)', async () => {
    const res = await request(app.server)
      .post('/api/export/pdf')
      .send({ ...samplePatternSpecBody(), title: '🧶 Winter 森 Forest ♥' })
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('winter-forest.pdf');
    expect((res.body as Buffer).subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('does not split a chart that fits one page into an orphan sliver column (cellW rounding)', async () => {
    // 35 sts at the default gauge used to round cellW UP past the page width, yielding an
    // unexplained "piece 2 of 2" page holding a single 1-stitch column while 34 and 36 fit.
    const { PDFDocument } = await import('pdf-lib');
    const pageCounts: number[] = [];
    for (const width of [34, 35, 36]) {
      const indices = Array.from({ length: width * 35 }, (_, i) => i % 2);
      const res = await request(app.server)
        .post('/api/export/pdf')
        .send({
          technique: 'stranded' as const,
          gauge: { stitchesPer4In: 22, rowsPer4In: 30 },
          grid: {
            width,
            height: 35,
            indices,
            palette: [
              { r: 20, g: 20, b: 20 },
              { r: 235, g: 235, b: 235 },
            ],
          },
        })
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        });
      expect(res.status).toBe(200);
      const doc = await PDFDocument.load(new Uint8Array(res.body as Buffer));
      pageCounts.push(doc.getPageCount());
    }
    // All three widths fit a single chart page, so total page counts must match.
    expect(pageCounts[1]).toBe(pageCounts[0]);
    expect(pageCounts[1]).toBe(pageCounts[2]);
  });

  it('rejects a grid with mismatched index length', async () => {
    const body = samplePatternSpecBody();
    body.grid.indices = body.grid.indices.slice(0, 5);
    const res = await request(app.server).post('/api/export/pdf').send(body);
    expect(res.status).toBe(400);
  });

  it('rejects a palette index out of range', async () => {
    const body = samplePatternSpecBody();
    body.grid.indices[0] = 99;
    const res = await request(app.server).post('/api/export/pdf').send(body);
    expect(res.status).toBe(400);
  });

  it('rejects a palette larger than MAX_COLORS (prevents an oversized-legend resource exhaustion request)', async () => {
    const body = samplePatternSpecBody();
    const oversizedPalette = Array.from({ length: 41 }, (_, i) => ({
      r: i % 256,
      g: 0,
      b: 0,
    }));
    const res = await request(app.server)
      .post('/api/export/pdf')
      .send({ ...body, grid: { ...body.grid, palette: oversizedPalette } });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/export/png', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns a valid PNG', async () => {
    const res = await request(app.server)
      .post('/api/export/png')
      .send(samplePatternSpecBody())
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    const body: Buffer = res.body;
    expect(Array.from(body.subarray(0, 8))).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';
import {
  makeColorBandsPng,
  makeGriddedChartPng,
  makeRampImagePng,
  makeTestImagePng,
} from './helpers.js';

describe('POST /api/pattern', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('processes an uploaded image into a quantized pattern', async () => {
    const image = await makeTestImagePng(40, 20);
    const options = {
      technique: 'stranded',
      widthStitches: 8,
      heightRows: 4,
      maxColors: 2,
      dither: 'none',
    };

    const res = await request(app.server)
      .post('/api/pattern')
      .field('options', JSON.stringify(options))
      .attach('image', image, 'test.png');

    expect(res.status).toBe(200);
    expect(res.body.grid.width).toBe(8);
    expect(res.body.grid.height).toBe(4);
    expect(res.body.grid.indices).toHaveLength(32);
    expect(res.body.grid.palette.length).toBeLessThanOrEqual(2);
    expect(res.body.pattern.technique).toBe('stranded');
    expect(res.body.pattern.rows).toHaveLength(4);
    expect(typeof res.body.shareLink).toBe('string');
    expect(res.body.yardage.totalEstimatedYards).toBeGreaterThan(0);
  });

  it('includes finished size only when gauge is provided', async () => {
    const image = await makeTestImagePng(20, 20);
    const withoutGauge = await request(app.server)
      .post('/api/pattern')
      .field(
        'options',
        JSON.stringify({ technique: 'texture', widthStitches: 5, heightRows: 5, dither: 'none' }),
      )
      .attach('image', image, 'test.png');
    expect(withoutGauge.body.finishedSize).toBeUndefined();

    const withGauge = await request(app.server)
      .post('/api/pattern')
      .field(
        'options',
        JSON.stringify({
          technique: 'texture',
          widthStitches: 5,
          heightRows: 5,
          dither: 'none',
          gauge: { stitchesPer4In: 20, rowsPer4In: 20 },
        }),
      )
      .attach('image', image, 'test.png');
    expect(withGauge.body.finishedSize).toEqual({ widthIn: 1, heightIn: 1 });
  });

  it('produces identical results for repeated calls with the same input (determinism)', async () => {
    const image = await makeTestImagePng(30, 30);
    const options = {
      technique: 'intarsia',
      widthStitches: 10,
      heightRows: 10,
      maxColors: 4,
      dither: 'floyd-steinberg',
    };

    const first = await request(app.server)
      .post('/api/pattern')
      .field('options', JSON.stringify(options))
      .attach('image', image, 'test.png');
    const second = await request(app.server)
      .post('/api/pattern')
      .field('options', JSON.stringify(options))
      .attach('image', image, 'test.png');

    expect(first.body.grid).toEqual(second.body.grid);
    expect(first.body.pattern).toEqual(second.body.pattern);
    expect(first.body.shareLink).toBe(second.body.shareLink);
  });

  it('echoes the seamless flag and changes the result compared to non-seamless', async () => {
    const image = await makeRampImagePng(40, 10);
    const baseOptions = {
      technique: 'stranded',
      widthStitches: 20,
      heightRows: 8,
      maxColors: 8,
      dither: 'none',
    };

    const withoutSeamless = await request(app.server)
      .post('/api/pattern')
      .field('options', JSON.stringify({ ...baseOptions, seamless: 'none' }))
      .attach('image', image, 'ramp.png');
    const withSeamless = await request(app.server)
      .post('/api/pattern')
      .field('options', JSON.stringify({ ...baseOptions, seamless: 'both' }))
      .attach('image', image, 'ramp.png');

    expect(withoutSeamless.status).toBe(200);
    expect(withSeamless.status).toBe(200);
    expect(withoutSeamless.body.seamless).toBe('none');
    expect(withSeamless.body.seamless).toBe('both');
    // Seamless blending alters the pixel data before quantization, so the resulting grid
    // should differ from the non-seamless run on this hard-wrap-edge test image.
    expect(withSeamless.body.grid).not.toEqual(withoutSeamless.body.grid);
  });

  it('repeats (tiles) the motif into a larger chart and echoes the repeat/motif info', async () => {
    const image = await makeTestImagePng(40, 20);
    const motif = { widthStitches: 10, heightRows: 6 };
    // seamless is pinned to 'none' because this test asserts byte-identical tiles; when a
    // repeat is requested with seamless unset, auto mode blends the joins instead.
    const single = await request(app.server)
      .post('/api/pattern')
      .field(
        'options',
        JSON.stringify({ technique: 'intarsia', ...motif, maxColors: 2, seamless: 'none' }),
      )
      .attach('image', image, 'test.png');
    const tiled = await request(app.server)
      .post('/api/pattern')
      .field(
        'options',
        JSON.stringify({
          technique: 'intarsia',
          ...motif,
          maxColors: 2,
          seamless: 'none',
          repeat: { across: 3, down: 2 },
        }),
      )
      .attach('image', image, 'test.png');

    expect(single.status).toBe(200);
    expect(tiled.status).toBe(200);
    // Final chart is motif size * repeat counts.
    expect(tiled.body.grid.width).toBe(30);
    expect(tiled.body.grid.height).toBe(12);
    expect(tiled.body.repeat).toEqual({ across: 3, down: 2 });
    expect(tiled.body.motif).toEqual(motif);

    // Every tile is byte-identical to the single motif: cell (x,y) == cell (x%10, y%6).
    const single1 = single.body.grid.indices as number[];
    const tiledIdx = tiled.body.grid.indices as number[];
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 30; x++) {
        expect(tiledIdx[y * 30 + x]).toBe(single1[(y % 6) * 10 + (x % 10)]);
      }
    }
  });

  it('rejects a repeat that would exceed the max grid dimension', async () => {
    const image = await makeTestImagePng(20, 20);
    const res = await request(app.server)
      .post('/api/pattern')
      .field(
        'options',
        JSON.stringify({
          technique: 'intarsia',
          widthStitches: 200,
          heightRows: 10,
          repeat: { across: 3, down: 1 }, // 200*3 = 600 > 400
        }),
      )
      .attach('image', image, 'test.png');
    expect(res.status).toBe(400);
    // The error must be specific and actionable, not a bare "Invalid options".
    expect(res.body.error).toMatch(/final width.*repeat across.*limit/i);
  });

  it('dominant sampling recovers flat chart colors that averaging muddies with gridlines', async () => {
    // A 20x20-cell gridded chart at 12px/cell: flat green + white cells behind a gray grid.
    const image = await makeGriddedChartPng(20, 20, 12);
    const baseOptions = {
      technique: 'intarsia',
      widthStitches: 20,
      heightRows: 20,
      maxColors: 8,
      dither: 'none',
      crop: { x: 0, y: 0, width: 240, height: 240 },
    };

    const avg = await request(app.server)
      .post('/api/pattern')
      .field('options', JSON.stringify({ ...baseOptions, sampling: 'average' }))
      .attach('image', image, 'chart.png');
    const dom = await request(app.server)
      .post('/api/pattern')
      .field('options', JSON.stringify({ ...baseOptions, sampling: 'dominant' }))
      .attach('image', image, 'chart.png');

    expect(avg.status).toBe(200);
    expect(dom.status).toBe(200);
    expect(dom.body.seamless).toBe('none');

    type C = { r: number; g: number; b: number };
    const has = (palette: C[], t: C) =>
      palette.some((c) => c.r === t.r && c.g === t.g && c.b === t.b);

    // Dominant sampling rejects the 1px gray grid in each cell and recovers the EXACT flat
    // source colors (green #1e7828 and white #f5f5f5).
    expect(has(dom.body.grid.palette, { r: 30, g: 120, b: 40 })).toBe(true);
    expect(has(dom.body.grid.palette, { r: 245, g: 245, b: 245 })).toBe(true);

    // Averaging blends the grid in, so neither exact color survives — every palette entry is
    // shifted toward gray.
    expect(has(avg.body.grid.palette, { r: 30, g: 120, b: 40 })).toBe(false);
    expect(has(avg.body.grid.palette, { r: 245, g: 245, b: 245 })).toBe(false);
  });

  it('produces identical results for repeated dominant-sampling calls (determinism)', async () => {
    const image = await makeGriddedChartPng(16, 16, 10);
    const options = {
      technique: 'intarsia',
      widthStitches: 16,
      heightRows: 16,
      maxColors: 6,
      dither: 'none',
      sampling: 'dominant',
      crop: { x: 0, y: 0, width: 160, height: 160 },
    };
    const first = await request(app.server)
      .post('/api/pattern')
      .field('options', JSON.stringify(options))
      .attach('image', image, 'chart.png');
    const second = await request(app.server)
      .post('/api/pattern')
      .field('options', JSON.stringify(options))
      .attach('image', image, 'chart.png');
    expect(first.body.grid).toEqual(second.body.grid);
    expect(first.body.shareLink).toBe(second.body.shareLink);
  });

  it('produces identical results for repeated seamless calls with the same input (determinism)', async () => {
    const image = await makeRampImagePng(30, 30);
    const options = {
      technique: 'texture',
      widthStitches: 12,
      heightRows: 12,
      dither: 'none',
      seamless: 'both',
    };

    const first = await request(app.server)
      .post('/api/pattern')
      .field('options', JSON.stringify(options))
      .attach('image', image, 'ramp.png');
    const second = await request(app.server)
      .post('/api/pattern')
      .field('options', JSON.stringify(options))
      .attach('image', image, 'ramp.png');

    expect(first.body.grid).toEqual(second.body.grid);
    expect(first.body.shareLink).toBe(second.body.shareLink);
  });

  it('generates a complete pattern from an image with NO options at all (auto mode)', async () => {
    const image = await makeColorBandsPng(200, 200);
    const res = await request(app.server).post('/api/pattern').attach('image', image, 'art.png');

    expect(res.status).toBe(200);
    // Every option was resolved to something concrete and reported back.
    const resolved = res.body.resolvedOptions;
    expect(resolved.technique).toBeDefined();
    expect(resolved.widthStitches).toBeGreaterThan(0);
    expect(resolved.heightRows).toBeGreaterThan(0);
    expect(resolved.maxColors).toBeGreaterThanOrEqual(2);
    expect(resolved.sampling).toBeDefined();
    expect(resolved.dither).toBeDefined();
    expect(res.body.grid.width).toBe(resolved.widthStitches * resolved.repeat.across);
    expect(res.body.grid.height).toBe(resolved.heightRows * resolved.repeat.down);
    expect(res.body.pattern.technique).toBe(resolved.technique);
    // Every auto choice comes with a human-readable reason.
    expect(res.body.autoDecisions.length).toBeGreaterThan(0);
    for (const d of res.body.autoDecisions) {
      expect(typeof d.field).toBe('string');
      expect(d.reason.length).toBeGreaterThan(10);
    }
    // Flat color bands: auto should pick dominant sampling and intarsia (4 blocks per row).
    expect(resolved.sampling).toBe('dominant');
    expect(resolved.technique).toBe('intarsia');
  });

  it('auto mode is deterministic across identical requests', async () => {
    const image = await makeColorBandsPng(120, 90);
    const first = await request(app.server)
      .post('/api/pattern')
      .field('options', '{}')
      .attach('image', image, 'art.png');
    const second = await request(app.server)
      .post('/api/pattern')
      .field('options', '{}')
      .attach('image', image, 'art.png');
    expect(first.status).toBe(200);
    expect(first.body.grid).toEqual(second.body.grid);
    expect(first.body.resolvedOptions).toEqual(second.body.resolvedOptions);
    expect(first.body.shareLink).toBe(second.body.shareLink);
  });

  it('auto mode fills only the fields the request left unset', async () => {
    const image = await makeColorBandsPng(120, 90);
    const res = await request(app.server)
      .post('/api/pattern')
      .field('options', JSON.stringify({ technique: 'stranded', maxColors: 3 }))
      .attach('image', image, 'art.png');

    expect(res.status).toBe(200);
    expect(res.body.resolvedOptions.technique).toBe('stranded');
    expect(res.body.resolvedOptions.maxColors).toBe(3);
    expect(res.body.grid.palette.length).toBeLessThanOrEqual(3);
    const decidedFields = (res.body.autoDecisions as { field: string }[]).map((d) => d.field);
    expect(decidedFields).not.toContain('technique');
    expect(decidedFields).not.toContain('maxColors');
  });

  it('honors shadeMergeDeltaE: 0 (keep every shade) and echoes the resolved value', async () => {
    const image = await makeColorBandsPng(120, 90);
    const off = await request(app.server)
      .post('/api/pattern')
      .field('options', JSON.stringify({ technique: 'intarsia', shadeMergeDeltaE: 0 }))
      .attach('image', image, 'art.png');
    expect(off.status).toBe(200);
    expect(off.body.resolvedOptions.shadeMergeDeltaE).toBe(0);

    const defaulted = await request(app.server)
      .post('/api/pattern')
      .field('options', JSON.stringify({ technique: 'intarsia' }))
      .attach('image', image, 'art.png');
    expect(defaulted.body.resolvedOptions.shadeMergeDeltaE).toBe(10);
  });

  it('rejects missing image', async () => {
    const res = await request(app.server)
      .post('/api/pattern')
      .field('options', JSON.stringify({ technique: 'stranded', widthStitches: 4, heightRows: 4 }));
    expect(res.status).toBe(400);
  });

  it('rejects invalid options', async () => {
    const image = await makeTestImagePng(10, 10);
    const res = await request(app.server)
      .post('/api/pattern')
      .field('options', JSON.stringify({ technique: 'stranded', widthStitches: 0, heightRows: 4 }))
      .attach('image', image, 'test.png');
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('rejects a non-image file', async () => {
    const res = await request(app.server)
      .post('/api/pattern')
      .field('options', JSON.stringify({ technique: 'stranded', widthStitches: 4, heightRows: 4 }))
      .attach('image', Buffer.from('not an image'), 'test.txt');
    expect(res.status).toBe(400);
  });
});

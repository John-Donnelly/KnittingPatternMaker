import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';
import { makeRampImagePng, makeTestImagePng } from './helpers.js';

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
      .field('options', JSON.stringify({ ...baseOptions, seamless: false }))
      .attach('image', image, 'ramp.png');
    const withSeamless = await request(app.server)
      .post('/api/pattern')
      .field('options', JSON.stringify({ ...baseOptions, seamless: true }))
      .attach('image', image, 'ramp.png');

    expect(withoutSeamless.status).toBe(200);
    expect(withSeamless.status).toBe(200);
    expect(withoutSeamless.body.seamless).toBe(false);
    expect(withSeamless.body.seamless).toBe(true);
    // Seamless blending alters the pixel data before quantization, so the resulting grid
    // should differ from the non-seamless run on this hard-wrap-edge test image.
    expect(withSeamless.body.grid).not.toEqual(withoutSeamless.body.grid);
  });

  it('produces identical results for repeated seamless calls with the same input (determinism)', async () => {
    const image = await makeRampImagePng(30, 30);
    const options = {
      technique: 'texture',
      widthStitches: 12,
      heightRows: 12,
      dither: 'none',
      seamless: true,
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

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';
import { makeTestImagePng } from './helpers.js';

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

import { describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';

describe('GET /health', () => {
  it('reports ok status', async () => {
    const app = buildServer();
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok' });
    await app.close();
  });
});

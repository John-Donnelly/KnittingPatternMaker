import Fastify from 'fastify';
import cors from '@fastify/cors';
import { CORE_VERSION } from 'knitting-pattern-core';

export function buildServer() {
  const app = Fastify({ logger: true });

  app.register(cors, { origin: true });

  app.get('/health', async () => ({
    status: 'ok',
    coreVersion: CORE_VERSION,
  }));

  return app;
}

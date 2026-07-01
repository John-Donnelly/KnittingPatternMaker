import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { CORE_VERSION } from 'knitting-pattern-core';
import { registerPatternRoute } from './routes/pattern.js';
import { registerExportRoutes } from './routes/export.js';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export function buildServer() {
  const app = Fastify({ logger: true });

  app.register(cors, { origin: true });
  app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

  app.get('/health', async () => ({
    status: 'ok',
    coreVersion: CORE_VERSION,
  }));

  app.register(registerPatternRoute);
  app.register(registerExportRoutes);

  app.setErrorHandler<FastifyError>((err, _request, reply) => {
    if (err.code === 'FST_REQ_FILE_TOO_LARGE' || err.statusCode === 413) {
      return reply.code(413).send({ error: 'Uploaded file is too large (max 25MB)' });
    }
    if (err.statusCode && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ error: err.message });
    }
    app.log.error(err);
    return reply.code(500).send({ error: 'Internal server error' });
  });

  return app;
}

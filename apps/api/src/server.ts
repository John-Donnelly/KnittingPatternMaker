import { existsSync } from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyError } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { CORE_VERSION } from 'knitting-pattern-core';
import { loadConfig, type AppConfig } from './config.js';
import { openDatabase } from './db.js';
import { registerPatternRoute } from './routes/pattern.js';
import { registerExportRoutes } from './routes/export.js';
import { registerAuthRoutes, requireAuth } from './routes/auth.js';
import { registerPatternsRoutes } from './routes/patterns.js';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Paths gated behind sign-in when AUTH_REQUIRED is on (the compute-heavy endpoints). */
const PROTECTED_PREFIXES = ['/api/pattern', '/api/export/'];

export function buildServer(configOverrides: Parameters<typeof loadConfig>[0] = {}) {
  const config: AppConfig = loadConfig(configOverrides);
  const db = openDatabase(config.effectiveDataDir);

  const app = Fastify({
    logger: {
      level: config.logLevel,
      // Never log cookie/authorization values.
      redact: ['req.headers.cookie', 'req.headers.authorization'],
    },
  });

  app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // The React app uses element style attributes; uploaded previews are blob:/data: URLs.
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  });

  app.register(cors, {
    // In production the API serves the frontend itself, so cross-origin isn't needed;
    // during development the Vite dev server proxies /api (same-origin) but direct calls
    // from localhost tooling are still handy.
    origin: config.nodeEnv === 'production' ? [config.publicUrl] : true,
    credentials: true,
  });

  app.register(cookie, { secret: config.effectiveSessionSecret });

  if (config.nodeEnv !== 'test') {
    app.register(rateLimit, {
      max: config.rateLimitMax,
      timeWindow: '1 minute',
      allowList: (req) => !req.url.startsWith('/api/'),
    });
  }

  app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

  app.get('/health', async () => ({
    status: 'ok',
    coreVersion: CORE_VERSION,
  }));
  app.get('/api/health', async () => ({
    status: 'ok',
    coreVersion: CORE_VERSION,
  }));

  // Sign-in gate for pattern generation/export (no-op unless AUTH_REQUIRED + OIDC configured).
  const guard = requireAuth(config);
  app.addHook('preHandler', async (request, reply) => {
    if (PROTECTED_PREFIXES.some((p) => request.url.startsWith(p))) {
      await guard(request, reply);
    }
  });

  app.register(registerAuthRoutes(config, db));
  app.register(registerPatternRoute);
  app.register(registerExportRoutes);
  app.register(registerPatternsRoutes(config, db));

  app.addHook('onClose', async () => {
    db.close();
  });

  // In production, serve the built frontend from the same process (single deployable).
  const staticRoot = config.staticRoot ? path.resolve(config.staticRoot) : '';
  if (staticRoot && existsSync(staticRoot)) {
    app.register(fastifyStatic, { root: staticRoot, wildcard: true });
    // SPA fallback: any non-API GET that isn't a real file renders the app shell.
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api/')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'Not found' });
    });
  } else if (config.staticRoot) {
    app.log.warn({ staticRoot }, 'STATIC_ROOT does not exist; static serving disabled');
  }

  app.setErrorHandler<FastifyError>((err, _request, reply) => {
    if (err.code === 'FST_REQ_FILE_TOO_LARGE' || err.statusCode === 413) {
      return reply.code(413).send({ error: 'Uploaded file is too large (max 25MB)' });
    }
    if (err.statusCode && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ error: err.message });
    }
    // 5xx details are logged, never leaked to the client.
    app.log.error(err);
    return reply.code(500).send({ error: 'Internal server error' });
  });

  return app;
}

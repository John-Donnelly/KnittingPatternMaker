import { buildServer } from './server.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = buildServer();

/** Force-exit if a graceful close stalls (e.g. a stuck keep-alive connection), so the
 * orchestrator's SIGKILL isn't the only backstop. */
const SHUTDOWN_TIMEOUT_MS = 10_000;

const shutdown = (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  const forceExit = setTimeout(() => {
    app.log.error('graceful shutdown timed out; forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  // Don't let the timer itself keep the event loop alive once close() resolves.
  forceExit.unref();
  app
    .close()
    .then(() => {
      clearTimeout(forceExit);
      process.exit(0);
    })
    .catch((err: unknown) => {
      app.log.error(err);
      process.exit(1);
    });
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

app.listen({ port: config.port, host: config.host }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});

import { buildServer } from './server.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = buildServer();

const shutdown = (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  app
    .close()
    .then(() => process.exit(0))
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

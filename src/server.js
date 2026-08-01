import env from './config/env.js';
import { connectDB, disconnectDB } from './database/connection.js';
import { pingRedis, closeAllRedis } from './database/redis.js';
import { createApp } from './app.js';
import { startWorkers, stopWorkers } from './workers/index.js';
import { logger } from './services/logging.js';

async function main() {
  await connectDB();
  await pingRedis();

  if (env.ENABLE_WORKERS) {
    await startWorkers();
  }

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info('server.started', 'Falcon AI API running', {
      port: env.PORT,
      workers: env.ENABLE_WORKERS,
    });
  });

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('server.shutdown', `Received ${signal}, shutting down gracefully`);
    server.close();
    if (env.ENABLE_WORKERS) await stopWorkers().catch(() => {});
    await closeAllRedis().catch(() => {});
    await disconnectDB().catch(() => {});
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('server.fatal', err.message);
  process.exit(1);
});

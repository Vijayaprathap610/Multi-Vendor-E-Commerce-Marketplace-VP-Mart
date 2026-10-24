import env from './config/env.js';
import { connectDb, disconnectDb } from './config/db.js';
import { createApp } from './app.js';
import { logger } from './utils/logger.js';
import { allModels } from './models/index.js';
import { closeRedis } from './services/cache.js';
import { startJobs } from './jobs/index.js';

async function main() {
  await connectDb();
  // Make sure unique/TTL indexes exist before accepting traffic.
  await Promise.all(allModels.map((m) => m.init()));

  const app = createApp();
  const stopJobs = startJobs();
  const server = app.listen(env.PORT, () => logger.info(`API listening on :${env.PORT}`));

  const shutdown = async (signal) => {
    logger.info({ signal }, 'shutting down');
    server.close(async () => {
      stopJobs();
      await closeRedis();
      await disconnectDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'fatal startup error');
  process.exit(1);
});

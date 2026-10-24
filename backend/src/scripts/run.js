// Tiny wrapper so one-off scripts connect to MongoDB, run, report and exit cleanly.
import { connectDb, disconnectDb } from '../config/db.js';
import { allModels } from '../models/index.js';
import { closeRedis } from '../services/cache.js';

export async function runScript(fn) {
  let code = 0;
  try {
    await connectDb();
    await Promise.all(allModels.map((m) => m.init()));
    await fn();
  } catch (err) {
    console.error(err.message);
    code = 1;
  } finally {
    await closeRedis().catch(() => {});
    await disconnectDb().catch(() => {});
  }
  process.exit(code);
}

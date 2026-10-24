// npm run media:cleanup : deletes uploaded images that were never attached (older than 24h).
import { runScript } from './run.js';
import { cleanupUnattached } from '../services/media.js';

runScript(async () => {
  const r = await cleanupUnattached(Number(process.env.MEDIA_MAX_AGE_HOURS || 24));
  console.log(`Media cleanup: scanned ${r.scanned}, deleted ${r.deleted}.`);
});

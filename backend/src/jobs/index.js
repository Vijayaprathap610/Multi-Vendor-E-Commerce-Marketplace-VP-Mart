import { cleanupUnattached } from '../services/media.js';
import { processDirty, searchEnabled } from '../services/searchSync.js';
import { expireStaleOrders } from '../services/orderService.js';
import { logger } from '../utils/logger.js';

// Lightweight in-process scheduler. For multi-instance deployments run these via cron instead
// (npm run media:cleanup / npm run search:sync) so each job runs once.
export function startJobs() {
  const timers = [];
  if (searchEnabled()) {
    timers.push(
      setInterval(
        () => processDirty().catch((e) => logger.error({ e }, 'search sync job failed')),
        60_000,
      ),
    );
  }
  timers.push(
    setInterval(
      () => cleanupUnattached(24).catch((e) => logger.error({ e }, 'media cleanup job failed')),
      6 * 3600_000,
    ),
  );
  // Unpaid online orders release their stock and coupon use when the payment window passes.
  timers.push(
    setInterval(
      () => expireStaleOrders().catch((e) => logger.error({ e }, 'order expiry job failed')),
      60_000,
    ),
  );
  timers.forEach((t) => t.unref());
  return () => timers.forEach(clearInterval);
}

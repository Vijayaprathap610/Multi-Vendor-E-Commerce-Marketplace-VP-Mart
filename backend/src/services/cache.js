import Redis from 'ioredis';
import env from '../config/env.js';
import { logger } from '../utils/logger.js';

// Redis is an accelerator, never the source of truth. If it is down every call falls through
// to MongoDB. Only PUBLIC catalogue data is cached under shared keys; per-user data (carts)
// uses keys scoped by user id.
let client = null;
let lastWarn = 0;

export function getRedis() {
  if (!env.REDIS_URL) return null;
  if (!client) {
    client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (n) => Math.min(n * 300, 3000),
    });
    client.on('error', (err) => {
      if (Date.now() - lastWarn > 30000) {
        lastWarn = Date.now();
        logger.warn({ err: err.message }, 'redis unavailable, serving from MongoDB');
      }
    });
  }
  return client;
}

export async function closeRedis() {
  if (client) {
    const c = client;
    client = null;
    await c.quit().catch(() => c.disconnect());
  }
}

async function safe(fn, fallback = null) {
  try {
    const r = getRedis();
    if (!r) return fallback;
    return await fn(r);
  } catch {
    return fallback;
  }
}

// One global catalogue version. Any price/stock/listing/category/banner change bumps it, which
// instantly invalidates every cached catalogue entry.
export const catalogVersion = async () => (await safe((r) => r.get('catalog:ver'))) || '0';
export const catalogChanged = () => safe((r) => r.incr('catalog:ver'));

export async function cached(namespace, key, ttlSeconds, compute) {
  const ver = await catalogVersion();
  const k = `c:${ver}:${namespace}:${key}`;
  const hit = await safe((r) => r.get(k));
  if (hit) {
    try {
      return JSON.parse(hit);
    } catch {
      /* fall through and recompute */
    }
  }
  const value = await compute();
  await safe((r) => r.set(k, JSON.stringify(value), 'EX', ttlSeconds));
  return value;
}

// Per-user cart cache (private key; contains only listing ids and quantities).
const cartKey = (userId) => `cart:u:${userId}`;
export const cartCache = {
  get: async (userId) => {
    const raw = await safe((r) => r.get(cartKey(userId)));
    return raw ? JSON.parse(raw) : null;
  },
  set: (userId, items) => safe((r) => r.set(cartKey(userId), JSON.stringify(items), 'EX', 3600)),
  del: (userId) => safe((r) => r.del(cartKey(userId))),
};

export const flushForTests = () => safe((r) => r.flushdb());

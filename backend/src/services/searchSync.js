import { Client } from '@elastic/elasticsearch';
import env from '../config/env.js';
import Listing from '../models/Listing.js';
import { logger } from '../utils/logger.js';

// MongoDB is authoritative. When Elasticsearch is configured, listings are mirrored into it:
// writers mark listings searchDirty, processDirty() pushes them, reindexAll() rebuilds the index.
// A failed push leaves the listing dirty so it is retried; nothing is lost.
export const searchEnabled = () => !!env.ELASTICSEARCH_URL;

let es;
export function esClient() {
  if (!searchEnabled()) return null;
  es ??= new Client({
    node: env.ELASTICSEARCH_URL,
    ...(env.ELASTICSEARCH_API_KEY ? { auth: { apiKey: env.ELASTICSEARCH_API_KEY } } : {}),
    requestTimeout: 5000,
    maxRetries: 1,
  });
  return es;
}
export const resetEsClientForTests = () => {
  es = undefined;
};

export const INDEX_MAPPING = {
  properties: {
    title: { type: 'search_as_you_type' },
    brandName: { type: 'text', fields: { keyword: { type: 'keyword' } } },
    categoryName: { type: 'text' },
    brandId: { type: 'keyword' },
    categoryPath: { type: 'keyword' },
    vendorId: { type: 'keyword' },
    pricePaise: { type: 'long' },
    ratingAvg: { type: 'float' },
    soldCount: { type: 'long' },
    viewCount: { type: 'long' },
    createdAt: { type: 'date' },
    inStock: { type: 'boolean' },
    isPublic: { type: 'boolean' },
  },
};

export const toSearchDoc = (l) => ({
  title: l.title,
  brandName: l.brandName,
  categoryName: l.categoryName,
  brandId: l.brandId ? String(l.brandId) : undefined,
  categoryPath: (l.categoryPath ?? []).map(String),
  vendorId: String(l.vendorId),
  pricePaise: l.pricePaise,
  ratingAvg: l.ratingAvg,
  soldCount: l.soldCount,
  viewCount: l.viewCount,
  createdAt: l.createdAt,
  inStock: !l.manualOutOfStock && l.stock > 0,
  isPublic: !!l.isPublic,
});

export async function markDirty(filter) {
  if (!searchEnabled()) return;
  await Listing.updateMany(filter, { $set: { searchDirty: true } });
}

async function pushBatch(listings) {
  const client = esClient();
  const operations = listings.flatMap((l) => [
    { index: { _index: env.ES_INDEX, _id: String(l._id) } },
    toSearchDoc(l),
  ]);
  const res = await client.bulk({ operations, refresh: false });
  const failed = new Set();
  res.items.forEach((it, i) => {
    if (it.index?.error) {
      failed.add(String(listings[i]._id));
      logger.error({ id: listings[i]._id, error: it.index.error }, 'search index failure');
    }
  });
  const okIds = listings.filter((l) => !failed.has(String(l._id))).map((l) => l._id);
  if (okIds.length) {
    await Listing.updateMany(
      { _id: { $in: okIds } },
      { $set: { searchDirty: false, searchIndexedAt: new Date() } },
    );
  }
  return { indexed: okIds.length, failed: failed.size };
}

export async function processDirty(limit = 500) {
  if (!searchEnabled()) return { skipped: true, indexed: 0, failed: 0 };
  const batch = await Listing.find({ searchDirty: true }).limit(limit).lean();
  if (!batch.length) return { indexed: 0, failed: 0 };
  try {
    return await pushBatch(batch);
  } catch (err) {
    logger.error({ err: err.message }, 'search sync failed; listings stay dirty for retry');
    return { indexed: 0, failed: batch.length, error: err.message };
  }
}

export async function reindexAll() {
  if (!searchEnabled()) throw new Error('ELASTICSEARCH_URL is not configured');
  const client = esClient();
  await client.indices.delete({ index: env.ES_INDEX }, { ignore: [404] });
  await client.indices.create({ index: env.ES_INDEX, mappings: INDEX_MAPPING });
  await Listing.updateMany({}, { $set: { searchDirty: true } });
  let total = { indexed: 0, failed: 0 };
  for (;;) {
    const r = await processDirty(500);
    total = { indexed: total.indexed + r.indexed, failed: total.failed + r.failed };
    if (!r.indexed) break;
  }
  await client.indices.refresh({ index: env.ES_INDEX });
  return total;
}

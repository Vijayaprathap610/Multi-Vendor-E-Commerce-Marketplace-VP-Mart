import env from '../config/env.js';
import Brand from '../models/Brand.js';
import Listing from '../models/Listing.js';
import VendorProfile from '../models/VendorProfile.js';
import { discountPercent } from '../utils/money.js';
import { escapeRegex } from '../utils/text.js';
import { logger } from '../utils/logger.js';
import { cached } from './cache.js';
import { resolveCategoryIds } from './catalogService.js';
import { esClient, searchEnabled } from './searchSync.js';

export const SORTS = ['relevance', 'price_asc', 'price_desc', 'popularity', 'rating', 'newest'];

export const toPublicListing = (l) => ({
  id: String(l._id),
  slug: l.slug,
  title: l.title,
  brand: l.brandId ? { id: String(l.brandId), name: l.brandName } : null,
  category: { id: String(l.categoryId), name: l.categoryName, slug: l.categorySlug },
  pricePaise: l.pricePaise,
  mrpPaise: l.mrpPaise,
  discountPercent: discountPercent(l.pricePaise, l.mrpPaise),
  inStock: !l.manualOutOfStock && l.stock > 0,
  stockLeft: !l.manualOutOfStock && l.stock > 0 && l.stock <= 5 ? l.stock : undefined,
  image: l.images?.[0]
    ? { url: l.images[0].url, thumbUrl: l.images[0].thumbUrl, alt: l.images[0].alt || l.title }
    : null,
  vendor: { id: String(l.vendorId), name: l.vendorName, slug: l.vendorSlug },
  ratingAvg: l.ratingAvg,
  ratingCount: l.ratingCount,
  prescriptionRequired: l.prescriptionRequired || undefined,
  createdAt: l.createdAt,
});

const SORT_MONGO = {
  relevance: { soldCount: -1, ratingAvg: -1, _id: -1 },
  price_asc: { pricePaise: 1, _id: 1 },
  price_desc: { pricePaise: -1, _id: 1 },
  popularity: { soldCount: -1, viewCount: -1, _id: -1 },
  rating: { ratingAvg: -1, ratingCount: -1, _id: -1 },
  newest: { createdAt: -1, _id: -1 },
};

async function resolveFilters(p) {
  const categoryIds = await resolveCategoryIds(p.category);
  if (p.category?.length && !categoryIds.length) return { empty: true };
  let brandIds = [];
  if (p.brand?.length) {
    const brands = await Brand.find({ slug: { $in: p.brand } })
      .select('_id')
      .lean();
    brandIds = brands.map((b) => b._id);
    if (!brandIds.length) return { empty: true };
  }
  let vendorId;
  if (p.vendor) {
    const vp = await VendorProfile.findOne({ slug: p.vendor }).select('userId').lean();
    if (!vp) return { empty: true };
    vendorId = vp.userId;
  }
  return { categoryIds, brandIds, vendorId };
}

// ---------- MongoDB driver (fallback / default when Elasticsearch is not configured) ----------
function mongoFilter(p, f) {
  const filter = { isPublic: true };
  if (f.categoryIds?.length) filter.categoryPath = { $in: f.categoryIds };
  if (f.brandIds?.length) filter.brandId = { $in: f.brandIds };
  if (f.vendorId) filter.vendorId = f.vendorId;
  if (p.minPrice != null || p.maxPrice != null) {
    filter.pricePaise = {};
    if (p.minPrice != null) filter.pricePaise.$gte = p.minPrice;
    if (p.maxPrice != null) filter.pricePaise.$lte = p.maxPrice;
  }
  if (p.inStock) {
    filter.manualOutOfStock = false;
    filter.stock = { $gt: 0 };
  }
  if (p.q) {
    // Every word must appear in the title, brand or category (case-insensitive, partial words ok).
    filter.$and = p.q
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 8)
      .map((w) => {
        const rx = new RegExp(escapeRegex(w), 'i');
        return { $or: [{ title: rx }, { brandName: rx }, { categoryName: rx }] };
      });
  }
  return filter;
}

async function mongoSearch(p, f) {
  const filter = mongoFilter(p, f);
  const skip = (p.page - 1) * p.limit;
  const [items, total, brands, price] = await Promise.all([
    Listing.find(filter).sort(SORT_MONGO[p.sort]).skip(skip).limit(p.limit).lean(),
    Listing.countDocuments(filter),
    Listing.aggregate([
      {
        $match: {
          ...mongoFilter({ ...p, brand: undefined }, { ...f, brandIds: [] }),
          brandId: { $ne: null },
        },
      },
      { $group: { _id: '$brandId', name: { $first: '$brandName' }, count: { $sum: 1 } } },
      { $sort: { count: -1, name: 1 } },
      { $limit: 20 },
    ]),
    Listing.aggregate([
      { $match: mongoFilter({ ...p, minPrice: undefined, maxPrice: undefined }, f) },
      { $group: { _id: null, min: { $min: '$pricePaise' }, max: { $max: '$pricePaise' } } },
    ]),
  ]);
  const slugs = await Brand.find({ _id: { $in: brands.map((b) => b._id) } })
    .select('slug')
    .lean();
  const slugOf = new Map(slugs.map((b) => [String(b._id), b.slug]));
  return {
    items: items.map(toPublicListing),
    total,
    facets: {
      brands: brands.map((b) => ({
        id: String(b._id),
        slug: slugOf.get(String(b._id)),
        name: b.name,
        count: b.count,
      })),
      price: price[0] ? { minPaise: price[0].min, maxPaise: price[0].max } : null,
    },
    source: 'mongodb',
  };
}

// ---------- Elasticsearch driver ----------
const ES_SORT = {
  relevance: ['_score', { soldCount: 'desc' }],
  price_asc: [{ pricePaise: 'asc' }],
  price_desc: [{ pricePaise: 'desc' }],
  popularity: [{ soldCount: 'desc' }, { viewCount: 'desc' }],
  rating: [{ ratingAvg: 'desc' }],
  newest: [{ createdAt: 'desc' }],
};

export function buildEsQuery(p, f) {
  const filter = [{ term: { isPublic: true } }];
  if (f.categoryIds?.length) filter.push({ terms: { categoryPath: f.categoryIds.map(String) } });
  if (f.brandIds?.length) filter.push({ terms: { brandId: f.brandIds.map(String) } });
  if (f.vendorId) filter.push({ term: { vendorId: String(f.vendorId) } });
  if (p.minPrice != null || p.maxPrice != null) {
    filter.push({
      range: {
        pricePaise: {
          ...(p.minPrice != null ? { gte: p.minPrice } : {}),
          ...(p.maxPrice != null ? { lte: p.maxPrice } : {}),
        },
      },
    });
  }
  if (p.inStock) filter.push({ term: { inStock: true } });
  const must = p.q
    ? [
        {
          multi_match: {
            query: p.q,
            type: 'bool_prefix',
            fields: ['title', 'title._2gram', 'title._3gram', 'brandName^2', 'categoryName'],
            fuzziness: 'AUTO',
            operator: 'and',
          },
        },
      ]
    : [{ match_all: {} }];
  return {
    from: (p.page - 1) * p.limit,
    size: p.limit,
    track_total_hits: true,
    _source: false,
    query: { bool: { must, filter } },
    sort:
      p.q && p.sort === 'relevance'
        ? ES_SORT.relevance
        : p.sort === 'relevance'
          ? ES_SORT.popularity
          : ES_SORT[p.sort],
    aggs: {
      brands: { terms: { field: 'brandId', size: 20 } },
      price: { stats: { field: 'pricePaise' } },
    },
  };
}

async function esSearch(p, f) {
  const body = buildEsQuery(p, f);
  const res = await esClient().search({ index: env.ES_INDEX, ...body });
  const ids = res.hits.hits.map((h) => h._id);
  // Hydrate from MongoDB so price/stock are always current, preserving Elasticsearch order.
  const docs = await Listing.find({ _id: { $in: ids }, isPublic: true }).lean();
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  const brandBuckets = res.aggregations?.brands?.buckets ?? [];
  const brands = await Brand.find({ _id: { $in: brandBuckets.map((b) => b.key) } })
    .select('name slug')
    .lean();
  const info = new Map(brands.map((b) => [String(b._id), b]));
  const total = typeof res.hits.total === 'number' ? res.hits.total : (res.hits.total?.value ?? 0);
  const stats = res.aggregations?.price;
  return {
    items: ids
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map(toPublicListing),
    total,
    facets: {
      brands: brandBuckets
        .filter((b) => info.has(String(b.key)))
        .map((b) => ({
          id: String(b.key),
          slug: info.get(String(b.key)).slug,
          name: info.get(String(b.key)).name,
          count: b.doc_count,
        })),
      price: stats?.count ? { minPaise: stats.min, maxPaise: stats.max } : null,
    },
    source: 'elasticsearch',
  };
}

export async function searchListings(params) {
  const f = await resolveFilters(params);
  if (f.empty)
    return {
      items: [],
      total: 0,
      facets: { brands: [], price: null },
      source: 'none',
      page: params.page,
      limit: params.limit,
      pages: 0,
    };
  const key = JSON.stringify([params, f.categoryIds?.map(String), f.brandIds?.map(String)]);
  const result = await cached('search', key, 60, async () => {
    if (searchEnabled()) {
      try {
        return await esSearch(params, f);
      } catch (err) {
        logger.error({ err: err.message }, 'Elasticsearch search failed, falling back to MongoDB');
        return { ...(await mongoSearch(params, f)), source: 'mongodb-fallback' };
      }
    }
    return mongoSearch(params, f);
  });
  return {
    ...result,
    page: params.page,
    limit: params.limit,
    pages: Math.ceil(result.total / params.limit),
  };
}

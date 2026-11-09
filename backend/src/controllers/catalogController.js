import env from '../config/env.js';
import Banner from '../models/Banner.js';
import Brand from '../models/Brand.js';
import Category from '../models/Category.js';
import Listing from '../models/Listing.js';
import Review from '../models/Review.js';
import VendorProfile from '../models/VendorProfile.js';
import { notFound } from '../utils/AppError.js';
import { escapeRegex } from '../utils/text.js';
import Coupon from '../models/Coupon.js';
import { describe } from '../services/couponService.js';
import { onlineEnabled } from '../services/paymentProvider.js';
import { cached } from '../services/cache.js';
import { categoryTree, publicCategory } from '../services/catalogService.js';
import { estimateDelivery } from '../services/deliveryEstimate.js';
import { DEAL_MIN_PERCENT, searchListings, toPublicListing } from '../services/search.js';

export const config = (_req, res) => {
  const social = Object.fromEntries(
    Object.entries({
      facebook: env.SOCIAL_FACEBOOK,
      instagram: env.SOCIAL_INSTAGRAM,
      x: env.SOCIAL_X,
      youtube: env.SOCIAL_YOUTUBE,
    }).filter(([, v]) => v),
  );
  res.json({
    region: { country: 'IN', currency: 'INR' },
    taxMode: env.TAX_MODE,
    social,
    // Only methods that can actually be used right now: online needs real provider keys.
    paymentMethods: ['cod', ...(onlineEnabled() ? ['online'] : [])],
  });
};

export async function publicCoupons(_req, res) {
  const now = new Date();
  const rows = await Coupon.find({
    isActive: true,
    isPublic: true,
    'eligibility.mode': 'all',
    validFrom: { $lte: now },
    validTo: { $gte: now },
  })
    .sort({ validTo: 1 })
    .limit(30)
    .lean();
  const live = rows.filter((c) => !c.usageLimit || c.usedCount + c.reservedCount < c.usageLimit);
  res.json({
    items: live.map((c) => ({
      code: c.code,
      title: c.title,
      description: describe(c),
      minPurchasePaise: c.minPurchasePaise,
      validTo: c.validTo,
      appliesToAll: c.appliesToAll,
    })),
  });
}

export const categories = async (_req, res) => res.json({ items: await categoryTree() });

export async function category(req, res) {
  const { slug } = req.valid.params;
  const c = await Category.findOne({ slug, isActive: true }).lean();
  if (!c) throw notFound('Category not found');
  const parent = c.parent ? await Category.findById(c.parent).lean() : null;
  const children = await Category.find({ parent: c._id, isActive: true })
    .sort({ sortOrder: 1, name: 1 })
    .lean();
  res.json({
    category: publicCategory(c),
    parent: parent ? publicCategory(parent) : null,
    children: children.map(publicCategory),
  });
}

export const search = async (req, res) => res.json(await searchListings(req.valid.query));

export async function suggest(req, res) {
  const { q } = req.valid.query;
  const out = await cached('suggest', q.toLowerCase(), 60, async () => {
    const rx = new RegExp(escapeRegex(q), 'i');
    const [titles, brands, cats] = await Promise.all([
      Listing.find({ isPublic: true, title: rx })
        .sort({ soldCount: -1 })
        .limit(5)
        .select('title')
        .lean(),
      Brand.find({ isActive: true, name: rx }).limit(3).select('name slug').lean(),
      Category.find({ isActive: true, name: rx }).limit(3).select('name slug').lean(),
    ]);
    return {
      products: [...new Set(titles.map((t) => t.title))],
      brands: brands.map((b) => ({ name: b.name, slug: b.slug })),
      categories: cats.map((c) => ({ name: c.name, slug: c.slug })),
    };
  });
  res.json(out);
}

export async function listingDetail(req, res) {
  const { id } = req.valid.params;
  const { pincode } = req.valid.query;
  const l = await Listing.findOne({ _id: id, isPublic: true }).lean();
  if (!l) throw notFound('Product not found');
  Listing.updateOne({ _id: id }, { $inc: { viewCount: 1 } }).catch(() => {});

  const [profile, leaf] = await Promise.all([
    VendorProfile.findOne({ userId: l.vendorId }).lean(),
    Category.findById(l.subcategoryId ?? l.categoryId).lean(),
  ]);
  const base = toPublicListing(l);
  res.json({
    listing: {
      ...base,
      description: l.description,
      attributes: l.attributes ?? {},
      images: (l.images ?? []).map((i) => ({
        url: i.url,
        thumbUrl: i.thumbUrl,
        alt: i.alt || l.title,
      })),
      expiryDate: l.expiryDate,
      gstPercent: l.gstPercent,
      taxMode: env.TAX_MODE,
    },
    vendor: profile
      ? {
          name: profile.shopName,
          slug: profile.slug,
          logoUrl: profile.logoUrl,
          description: profile.description,
          since: profile.createdAt,
        }
      : null,
    delivery:
      pincode && profile ? estimateDelivery({ vendor: profile, category: leaf, pincode }) : null,
  });
}

export async function listingReviews(req, res) {
  const { id } = req.valid.params;
  const { page, limit } = req.valid.query;
  const [items, total, dist] = await Promise.all([
    Review.find({ listingId: id, status: 'visible' })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('buyerId', 'name')
      .lean(),
    Review.countDocuments({ listingId: id, status: 'visible' }),
    Review.aggregate([
      {
        $match: {
          listingId: new (await import('mongoose')).default.Types.ObjectId(id),
          status: 'visible',
        },
      },
      { $group: { _id: '$rating', n: { $sum: 1 } } },
    ]),
  ]);
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const d of dist) distribution[d._id] = d.n;
  res.json({
    items: items.map((r) => ({
      id: String(r._id),
      rating: r.rating,
      title: r.title,
      body: r.body,
      createdAt: r.createdAt,
      // Privacy: first name and last initial only.
      reviewer: r.buyerId?.name
        ? r.buyerId.name
            .split(' ')
            .map((p, i, a) => (i === 0 ? p : i === a.length - 1 ? `${p[0]}.` : ''))
            .filter(Boolean)
            .join(' ')
        : 'Buyer',
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
    distribution,
  });
}

export async function related(req, res) {
  const { id } = req.valid.params;
  const l = await Listing.findOne({ _id: id, isPublic: true }).lean();
  if (!l) throw notFound('Product not found');
  const items = await Listing.find({
    isPublic: true,
    productId: { $ne: l.productId },
    categoryPath: l.categoryPath[l.categoryPath.length - 1],
  })
    .sort({ soldCount: -1, ratingAvg: -1 })
    .limit(8)
    .lean();
  res.json({ items: items.map(toPublicListing) });
}

export async function vendorShop(req, res) {
  const { slug } = req.valid.params;
  const p = await VendorProfile.findOne({ slug }).lean();
  if (!p) throw notFound('Shop not found');
  const active = await Listing.exists({ vendorId: p.userId, isPublic: true });
  if (!active) throw notFound('Shop not found');
  res.json({
    shop: {
      name: p.shopName,
      slug: p.slug,
      description: p.description,
      logoUrl: p.logoUrl,
      since: p.createdAt,
    },
  });
}

const inWindow = () => ({
  isActive: true,
  startAt: { $lte: new Date() },
  endAt: { $gte: new Date() },
});

export async function banners(_req, res) {
  // Not cached by the catalogue version: validity depends on the clock, so compute each time.
  const items = await Banner.find(inWindow()).sort({ sortOrder: 1, startAt: -1 }).limit(10).lean();
  res.json({
    items: items.map((b) => ({
      id: String(b._id),
      title: b.title,
      description: b.description,
      imageUrl: b.imageUrl,
      ctaLabel: b.ctaLabel,
      destination: b.destination,
      kind: b.kind,
    })),
  });
}

export async function bannerClick(req, res) {
  const r = await Banner.updateOne(
    { _id: req.valid.params.id, ...inWindow() },
    { $inc: { clicks: 1 } },
  );
  if (!r.matchedCount) throw notFound('Banner not found');
  res.status(204).end();
}

export async function home(_req, res) {
  const data = await cached('home', 'v1', 120, async () => {
    const base = { isPublic: true };
    const inStock = { ...base, manualOutOfStock: false, stock: { $gt: 0 } };
    const take = (q, sort, n = 12) =>
      Listing.find(q)
        .sort(sort)
        .limit(n)
        .lean()
        .then((a) => a.map(toPublicListing));
    const [featured, brandAgg, trending, best, fresh, deals, picks] = await Promise.all([
      Listing.aggregate([
        { $match: base },
        { $group: { _id: { $arrayElemAt: ['$categoryPath', 0] }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Listing.aggregate([
        { $match: { ...base, brandId: { $ne: null } } },
        { $group: { _id: '$brandId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 12 },
      ]),
      Listing.aggregate([
        { $match: inStock },
        { $addFields: { score: { $add: [{ $multiply: ['$soldCount', 5] }, '$viewCount'] } } },
        { $match: { score: { $gt: 0 } } },
        { $sort: { score: -1 } },
        { $limit: 12 },
      ]).then((a) => a.map(toPublicListing)),
      take({ ...inStock, soldCount: { $gt: 0 } }, { soldCount: -1 }),
      take(inStock, { createdAt: -1 }),
      Listing.aggregate([
        {
          $match: {
            ...inStock,
            $expr: {
              $gte: [
                { $multiply: [{ $subtract: ['$mrpPaise', '$pricePaise'] }, 100] },
                { $multiply: ['$mrpPaise', DEAL_MIN_PERCENT] },
              ],
            },
          },
        },
        {
          $addFields: {
            off: { $divide: [{ $subtract: ['$mrpPaise', '$pricePaise'] }, '$mrpPaise'] },
          },
        },
        { $sort: { off: -1 } },
        { $limit: 12 },
      ]).then((a) => a.map(toPublicListing)),
      take({ ...inStock, ratingCount: { $gt: 0 } }, { ratingAvg: -1, ratingCount: -1 }),
    ]);
    const allTopCats = await Category.find({
      parent: null,
      isActive: true,
    })
      .sort({ sortOrder: 1, name: 1 })
      .lean();
    const countById = new Map(featured.map((f) => [String(f._id), f.count]));
    const featuredCategories = allTopCats.map((c) => ({
      ...publicCategory(c),
      listingCount: countById.get(String(c._id)) || 0,
    }));
    const brands = await Brand.find({
      _id: { $in: brandAgg.map((b) => b._id) },
      isActive: true,
    }).lean();
    const brandById = new Map(brands.map((b) => [String(b._id), b]));
    return {
      featuredCategories,
      popularBrands: brandAgg
        .filter((b) => brandById.has(String(b._id)))
        .map((b) => ({
          id: String(b._id),
          name: brandById.get(String(b._id)).name,
          slug: brandById.get(String(b._id)).slug,
          logoUrl: brandById.get(String(b._id)).logoUrl,
          listingCount: b.count,
        })),
      trending,
      bestSellers: best,
      newArrivals: fresh,
      todaysDeals: deals,
      popularPicks: picks,
      dealThresholdPercent: DEAL_MIN_PERCENT,
    };
  });
  res.json(data);
}

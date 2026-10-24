import Banner from '../models/Banner.js';
import Brand from '../models/Brand.js';
import Category from '../models/Category.js';
import ContactMessage from '../models/ContactMessage.js';
import Listing from '../models/Listing.js';
import Product from '../models/Product.js';
import User from '../models/User.js';
import VendorProfile from '../models/VendorProfile.js';
import { AppError, notFound } from '../utils/AppError.js';
import { escapeRegex, slugify } from '../utils/text.js';
import { audit } from '../services/auditService.js';
import { catalogChanged } from '../services/cache.js';
import { refreshVisibility, syncCategoryVisibility } from '../services/catalogService.js';
import { claimImages, releaseImage } from '../services/media.js';
import { adminVendorView } from '../services/vendorService.js';

const dupe = (err, field) => {
  if (err?.code === 11000)
    throw new AppError(409, 'DUPLICATE', `A ${field} with that name already exists`, {
      name: 'Already exists',
    });
  throw err;
};

// ---------- categories ----------
export async function listCategories(_req, res) {
  const items = await Category.find().sort({ sortOrder: 1, name: 1 }).lean();
  const counts = await Listing.aggregate([
    { $unwind: '$categoryPath' },
    { $group: { _id: '$categoryPath', n: { $sum: 1 } } },
  ]);
  const n = new Map(counts.map((c) => [String(c._id), c.n]));
  res.json({
    items: items.map((c) => ({ ...c, id: String(c._id), listingCount: n.get(String(c._id)) ?? 0 })),
  });
}

export async function createCategory(req, res) {
  const b = req.valid.body;
  let parent = null;
  if (b.parent) {
    parent = await Category.findById(b.parent);
    if (!parent)
      throw new AppError(422, 'BAD_PARENT', 'Parent category not found', { parent: 'Invalid' });
    if (parent.parent)
      throw new AppError(422, 'TOO_DEEP', 'Only two category levels are supported', {
        parent: 'Choose a top-level category',
      });
  }
  const doc = {
    name: b.name,
    slug: slugify(b.name),
    parent: parent?._id ?? null,
    description: b.description,
    sortOrder: b.sortOrder ?? 0,
    // Sub-categories start with their parent's rules and can be edited afterwards.
    regulation: b.regulation ?? (parent ? 'inherit' : 'none'),
    deviceFields: b.deviceFields ?? parent?.deviceFields ?? false,
    gstPercent: b.gstPercent ?? parent?.gstPercent ?? 18,
    shipping: b.shipping ?? parent?.shipping?.toObject?.() ?? { maxZone: 'national', extraDays: 0 },
  };
  if (b.imageKey) {
    const [a] = await claimImages([b.imageKey], req.user._id, 'category', { isAdmin: true });
    doc.imageKey = a.key;
    doc.imageUrl = a.url;
  }
  try {
    const c = await Category.create(doc);
    await catalogChanged();
    await audit(req, 'category.created', { target: { type: 'Category', id: c._id } });
    res.status(201).json({ category: c });
  } catch (err) {
    dupe(err, 'category');
  }
}

export async function updateCategory(req, res) {
  const c = await Category.findById(req.valid.params.id);
  if (!c) throw notFound('Category not found');
  const b = req.valid.body;
  const wasActive = c.isActive;
  const oldImage = c.imageKey;
  for (const k of [
    'name',
    'description',
    'sortOrder',
    'regulation',
    'deviceFields',
    'gstPercent',
    'shipping',
    'isActive',
  ]) {
    if (b[k] !== undefined) c[k] = b[k];
  }
  if (b.name) c.slug = slugify(b.name);
  if (b.imageKey !== undefined) {
    if (b.imageKey) {
      const [a] = await claimImages([b.imageKey], req.user._id, 'category', { isAdmin: true });
      c.imageKey = a.key;
      c.imageUrl = a.url;
    } else {
      c.imageKey = undefined;
      c.imageUrl = undefined;
    }
  }
  try {
    await c.save();
  } catch (err) {
    dupe(err, 'category');
  }
  if (oldImage && oldImage !== c.imageKey) await releaseImage(oldImage);
  // Deactivating hides listings from the public site; the listings and every order stay intact.
  if (b.isActive !== undefined && b.isActive !== wasActive) await syncCategoryVisibility();
  else await catalogChanged();
  if (b.gstPercent !== undefined || b.name) {
    await Listing.updateMany(
      { categoryPath: { $in: [c._id] }, $or: [{ categoryId: c._id }, { subcategoryId: c._id }] },
      { $set: { ...(b.gstPercent !== undefined ? { gstPercent: c.gstPercent } : {}) } },
    );
  }
  await audit(
    req,
    b.isActive !== undefined && b.isActive !== wasActive
      ? c.isActive
        ? 'category.activated'
        : 'category.deactivated'
      : 'category.updated',
    { target: { type: 'Category', id: c._id } },
  );
  res.json({ category: c });
}

// ---------- brands ----------
export async function listBrands(_req, res) {
  const items = await Brand.find().sort({ name: 1 }).lean();
  const counts = await Listing.aggregate([
    { $match: { brandId: { $ne: null } } },
    { $group: { _id: '$brandId', n: { $sum: 1 } } },
  ]);
  const n = new Map(counts.map((c) => [String(c._id), c.n]));
  res.json({
    items: items.map((b) => ({ ...b, id: String(b._id), listingCount: n.get(String(b._id)) ?? 0 })),
  });
}
export async function createBrand(req, res) {
  const { name, isActive, logoKey } = req.valid.body;
  const doc = { name, slug: slugify(name), isActive: isActive ?? true };
  if (logoKey) {
    const [a] = await claimImages([logoKey], req.user._id, 'brand', { isAdmin: true });
    doc.logoKey = a.key;
    doc.logoUrl = a.url;
  }
  try {
    const b = await Brand.create(doc);
    await catalogChanged();
    await audit(req, 'brand.created', { target: { type: 'Brand', id: b._id } });
    res.status(201).json({ brand: b });
  } catch (err) {
    dupe(err, 'brand');
  }
}
export async function updateBrand(req, res) {
  const b = await Brand.findById(req.valid.params.id);
  if (!b) throw notFound('Brand not found');
  const body = req.valid.body;
  const oldLogo = b.logoKey;
  if (body.name) {
    b.name = body.name;
    b.slug = slugify(body.name);
  }
  if (body.isActive !== undefined) b.isActive = body.isActive;
  if (body.logoKey !== undefined) {
    if (body.logoKey) {
      const [a] = await claimImages([body.logoKey], req.user._id, 'brand', { isAdmin: true });
      b.logoKey = a.key;
      b.logoUrl = a.url;
    } else {
      b.logoKey = undefined;
      b.logoUrl = undefined;
    }
  }
  try {
    await b.save();
  } catch (err) {
    dupe(err, 'brand');
  }
  if (oldLogo && oldLogo !== b.logoKey) await releaseImage(oldLogo);
  if (body.name) {
    await Listing.updateMany({ brandId: b._id }, { $set: { brandName: b.name } });
    await Product.updateMany({ brandId: b._id }, { $set: { brandName: b.name } });
    await refreshVisibility({ brandId: b._id });
  } else await catalogChanged();
  await audit(req, 'brand.updated', { target: { type: 'Brand', id: b._id } });
  res.json({ brand: b });
}

// ---------- banners / advertisements ----------
export async function listBanners(_req, res) {
  const items = await Banner.find().sort({ createdAt: -1 }).lean();
  const now = new Date();
  res.json({
    items: items.map((b) => ({
      ...b,
      id: String(b._id),
      live: b.isActive && b.startAt <= now && b.endAt >= now,
    })),
  });
}
export async function createBanner(req, res) {
  const b = req.valid.body;
  const [a] = await claimImages([b.imageKey], req.user._id, 'banner', { isAdmin: true });
  const doc = await Banner.create({
    ...b,
    imageKey: a.key,
    imageUrl: a.url,
    createdBy: req.user._id,
  });
  await catalogChanged();
  await audit(req, 'banner.created', { target: { type: 'Banner', id: doc._id } });
  res.status(201).json({ banner: doc });
}
export async function updateBanner(req, res) {
  const doc = await Banner.findById(req.valid.params.id);
  if (!doc) throw notFound('Banner not found');
  const b = req.valid.body;
  const oldKey = doc.imageKey;
  if (b.imageKey && b.imageKey !== doc.imageKey) {
    const [a] = await claimImages([b.imageKey], req.user._id, 'banner', { isAdmin: true });
    doc.imageKey = a.key;
    doc.imageUrl = a.url;
  }
  for (const k of [
    'title',
    'description',
    'ctaLabel',
    'destination',
    'kind',
    'startAt',
    'endAt',
    'isActive',
    'sortOrder',
  ])
    if (b[k] !== undefined) doc[k] = b[k];
  if (doc.endAt <= doc.startAt)
    throw new AppError(422, 'BAD_DATES', 'End must be after start', {
      endAt: 'End must be after start',
    });
  await doc.save();
  if (oldKey !== doc.imageKey) await releaseImage(oldKey);
  await catalogChanged();
  await audit(req, 'banner.updated', { target: { type: 'Banner', id: doc._id } });
  res.json({ banner: doc });
}
// Real deletion: the database record is removed first, then the image is deleted from storage
// only if nothing else references it. The response reports exactly what happened.
export async function deleteBanner(req, res) {
  const doc = await Banner.findById(req.valid.params.id);
  if (!doc) throw notFound('Banner not found');
  const { imageKey } = doc;
  const r = await Banner.deleteOne({ _id: doc._id });
  if (r.deletedCount !== 1)
    throw new AppError(500, 'DELETE_FAILED', 'The banner could not be deleted');
  await catalogChanged();
  const cleanup = await releaseImage(imageKey);
  await audit(req, 'banner.deleted', {
    target: { type: 'Banner', id: doc._id },
    metadata: { imageCleanup: cleanup },
  });
  res.json({ deleted: true, image: cleanup.deleted ? 'deleted' : cleanup.reason });
}

// ---------- listings (admin view) ----------
export async function adminListings(req, res) {
  const { q, vendor, category, status, stock, page, limit } = req.valid.query;
  const filter = {};
  if (vendor) filter.vendorId = vendor;
  if (category) filter.categoryPath = category;
  if (status) filter.status = status;
  if (stock === 'out') filter.$or = [{ manualOutOfStock: true }, { stock: { $lte: 0 } }];
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$and = [{ $or: [{ title: rx }, { sku: rx }, { vendorName: rx }, { brandName: rx }] }];
  }
  const [items, total, metrics] = await Promise.all([
    Listing.find(filter)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Listing.countDocuments(filter),
    catalogMetrics(filter),
  ]);
  res.json({
    items: items.map((l) => ({
      id: String(l._id),
      title: l.title,
      sku: l.sku,
      productId: String(l.productId),
      vendorId: String(l.vendorId),
      vendorName: l.vendorName,
      category: l.categoryName,
      pricePaise: l.pricePaise,
      mrpPaise: l.mrpPaise,
      stock: l.stock,
      soldCount: l.soldCount,
      status: l.status,
      hiddenReason: l.hiddenReason,
      outOfStock: l.manualOutOfStock || l.stock <= 0,
      image: l.images?.[0]?.thumbUrl ?? null,
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
    metrics,
  });
}

// Unique products, vendor listings, stock units and units sold are four different numbers.
async function catalogMetrics(filter = {}) {
  const [row] = await Listing.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        listings: { $sum: 1 },
        products: { $addToSet: '$productId' },
        stockUnits: { $sum: '$stock' },
        unitsSold: { $sum: '$soldCount' },
        outOfStock: {
          $sum: { $cond: [{ $or: ['$manualOutOfStock', { $lte: ['$stock', 0] }] }, 1, 0] },
        },
        hidden: { $sum: { $cond: [{ $eq: ['$status', 'hidden'] }, 1, 0] } },
      },
    },
    {
      $project: {
        _id: 0,
        listings: 1,
        uniqueProducts: { $size: '$products' },
        stockUnits: 1,
        unitsSold: 1,
        outOfStock: 1,
        hidden: 1,
      },
    },
  ]);
  return (
    row ?? { listings: 0, uniqueProducts: 0, stockUnits: 0, unitsSold: 0, outOfStock: 0, hidden: 0 }
  );
}

export async function moderateListing(req, res) {
  const l = await Listing.findById(req.valid.params.id);
  if (!l) throw notFound('Listing not found');
  const { action, reason } = req.valid.body;
  if (action === 'hide') {
    l.status = 'hidden';
    l.hiddenReason = reason;
  } else {
    if (l.status !== 'hidden') throw new AppError(409, 'NOT_HIDDEN', 'This listing is not hidden');
    l.status = 'active';
    l.hiddenReason = undefined;
  }
  l.isPublic = l.status === 'active' && l.catActive && l.vendorActive;
  await l.save();
  await refreshVisibility({ _id: l._id });
  await audit(req, `listing.${action}`, {
    target: { type: 'Listing', id: l._id },
    metadata: { reason },
  });
  res.json({ listing: { id: String(l._id), status: l.status, isPublic: l.isPublic } });
}

// ---------- vendors ----------
export async function listVendors(req, res) {
  const { status, q, submitted, page, limit } = req.valid.query;
  const userFilter = { role: 'vendor' };
  if (status) userFilter.status = status;
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    userFilter.$or = [{ name: rx }, { email: rx }];
  }
  if (submitted) {
    const ids = await VendorProfile.find({ submittedAt: { $exists: true } }).distinct('userId');
    userFilter._id = { $in: ids };
  }
  const [users, total] = await Promise.all([
    User.find(userFilter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(userFilter),
  ]);
  const profiles = await VendorProfile.find({ userId: { $in: users.map((u) => u._id) } });
  const pOf = new Map(profiles.map((p) => [String(p.userId), p]));
  res.json({
    items: users.map((u) => adminVendorView(u, pOf.get(String(u._id)))),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}
export async function getVendor(req, res) {
  const u = await User.findOne({ _id: req.valid.params.id, role: 'vendor' });
  if (!u) throw notFound('Vendor not found');
  const [p, metrics] = await Promise.all([
    VendorProfile.findOne({ userId: u._id }),
    catalogMetrics({ vendorId: u._id }),
  ]);
  res.json({ vendor: adminVendorView(u, p), metrics });
}
export async function warnVendor(req, res) {
  const p = await VendorProfile.findOne({ userId: req.valid.params.id });
  if (!p) throw notFound('Vendor profile not found');
  p.warnings.push({ message: req.valid.body.message, by: req.user._id });
  await p.save();
  await audit(req, 'vendor.warned', {
    target: { type: 'User', id: p.userId },
    metadata: { message: req.valid.body.message },
  });
  res.status(201).json({ warnings: p.warnings });
}

// ---------- overview, messages ----------
export async function overview(_req, res) {
  const [users, categories, metrics, banners, openMessages] = await Promise.all([
    User.aggregate([{ $group: { _id: { role: '$role', status: '$status' }, n: { $sum: 1 } } }]),
    Category.countDocuments({ parent: null }),
    catalogMetrics({}),
    Banner.countDocuments({
      isActive: true,
      startAt: { $lte: new Date() },
      endAt: { $gte: new Date() },
    }),
    ContactMessage.countDocuments({ status: 'new' }),
  ]);
  const by = {};
  for (const { _id, n } of users) {
    by[_id.role] ??= { total: 0 };
    by[_id.role][_id.status] = n;
    by[_id.role].total += n;
  }
  res.json({
    users: by,
    catalog: { ...metrics, categories },
    promotions: { liveBanners: banners },
    support: { openMessages },
  });
}
export async function listMessages(_req, res) {
  const items = await ContactMessage.find().sort({ createdAt: -1 }).limit(100).lean();
  res.json({ items: items.map((m) => ({ ...m, id: String(m._id) })) });
}
export async function resolveMessage(req, res) {
  const m = await ContactMessage.findByIdAndUpdate(
    req.valid.params.id,
    { status: 'resolved' },
    { returnDocument: 'after' },
  );
  if (!m) throw notFound('Message not found');
  res.json({ message: m });
}

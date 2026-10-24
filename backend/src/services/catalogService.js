import Category from '../models/Category.js';
import Listing from '../models/Listing.js';
import { cached, catalogChanged } from './cache.js';
import { markDirty } from './searchSync.js';

// A listing is public only when the vendor sells it, its category chain is active and the
// vendor account is active. The flag is stored so public queries stay a single indexed lookup.
const VISIBILITY_STAGE = [
  { $set: { isPublic: { $and: [{ $eq: ['$status', 'active'] }, '$catActive', '$vendorActive'] } } },
];

export async function refreshVisibility(filter) {
  const res = await Listing.updateMany(filter, VISIBILITY_STAGE, { updatePipeline: true });
  await markDirty(filter);
  await catalogChanged();
  return res.modifiedCount;
}

export async function onVendorStatusChange(vendorId, isActive) {
  await Listing.updateMany({ vendorId }, { $set: { vendorActive: isActive } });
  return refreshVisibility({ vendorId });
}

// Recalculates catActive for every listing from the live category tree.
export async function syncCategoryVisibility() {
  const cats = await Category.find().select('parent isActive').lean();
  const byId = new Map(cats.map((c) => [String(c._id), c]));
  const active = (id) => {
    const c = byId.get(String(id));
    return !!c && c.isActive && (!c.parent || active(c.parent));
  };
  const inactiveIds = cats.filter((c) => !active(c._id)).map((c) => c._id);
  await Listing.updateMany({}, { $set: { catActive: true } });
  if (inactiveIds.length) {
    await Listing.updateMany(
      { categoryPath: { $in: inactiveIds } },
      { $set: { catActive: false } },
    );
  }
  return refreshVisibility({});
}

export const categoryTree = () =>
  cached('cats', 'tree', 600, async () => {
    const cats = await Category.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean();
    const out = cats.filter((c) => !c.parent).map((c) => ({ ...publicCategory(c), children: [] }));
    const idx = new Map(out.map((c) => [c.id, c]));
    for (const c of cats.filter((x) => x.parent))
      idx.get(String(c.parent))?.children.push(publicCategory(c));
    return out;
  });

export const publicCategory = (c) => ({
  id: String(c._id),
  name: c.name,
  slug: c.slug,
  description: c.description,
  imageUrl: c.imageUrl,
  parent: c.parent ? String(c.parent) : null,
});

// Resolves "electronics,kids-baby" to those category ids plus all of their descendants.
export async function resolveCategoryIds(slugs) {
  if (!slugs?.length) return [];
  const roots = await Category.find({ slug: { $in: slugs }, isActive: true })
    .select('_id')
    .lean();
  const rootIds = roots.map((r) => r._id);
  const kids = await Category.find({ parent: { $in: rootIds }, isActive: true })
    .select('_id')
    .lean();
  return [...rootIds, ...kids.map((k) => k._id)];
}

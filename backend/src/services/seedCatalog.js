import Category from '../models/Category.js';
import { CATEGORY_SEED } from '../data/categories.js';
import { catalogChanged } from './cache.js';

// Idempotent: re-running adds missing categories and never overwrites admin edits.
export async function seedCategories() {
  let created = 0;
  let existing = 0;
  let order = 0;
  for (const top of CATEGORY_SEED) {
    const { subs, name, slug, ...rest } = top;
    let parent = await Category.findOne({ slug });
    if (parent) {
      existing++;
      if (!parent.imageUrl && rest.imageUrl) {
        await Category.updateOne({ _id: parent._id }, { $set: { imageUrl: rest.imageUrl } });
      }
    } else {
      parent = await Category.create({ name, slug, sortOrder: order, regulation: 'none', ...rest });
      created++;
    }
    order++;
    let subOrder = 0;
    for (const s of subs) {
      const { name: sName, slug: sSlug, ...sRest } = s;
      const subExists = await Category.findOne({ slug: sSlug });
      if (subExists) {
        existing++;
        if (!subExists.imageUrl && sRest.imageUrl) {
          await Category.updateOne({ _id: subExists._id }, { $set: { imageUrl: sRest.imageUrl } });
        }
      } else {
        await Category.create({
          name: sName,
          slug: sSlug,
          parent: parent._id,
          sortOrder: subOrder,
          // Inherit the parent's rules unless the seed overrides them.
          regulation: 'inherit',
          deviceFields: parent.deviceFields,
          gstPercent: parent.gstPercent,
          shipping: parent.shipping?.toObject?.() ?? parent.shipping,
          ...sRest,
        });
        created++;
      }
      subOrder++;
    }
  }
  await catalogChanged();
  return { created, existing, total: await Category.countDocuments() };
}

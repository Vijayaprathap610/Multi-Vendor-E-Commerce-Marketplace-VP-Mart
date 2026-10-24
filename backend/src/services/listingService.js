import Brand from '../models/Brand.js';
import Category from '../models/Category.js';
import Listing from '../models/Listing.js';
import Product from '../models/Product.js';
import VendorProfile from '../models/VendorProfile.js';
import { AppError, conflict, forbidden, notFound } from '../utils/AppError.js';
import { normKey, slugify } from '../utils/text.js';
import { catalogChanged } from './cache.js';
import { claimImages, releaseImage } from './media.js';
import { searchEnabled } from './searchSync.js';

async function resolveBrand({ id, name } = {}) {
  if (id) {
    const b = await Brand.findById(id);
    if (!b || !b.isActive)
      throw new AppError(422, 'BAD_BRAND', 'Unknown or inactive brand', {
        brand: 'Choose a valid brand',
      });
    return b;
  }
  if (!name) return null;
  const existing = await Brand.findOne({ name }).collation({ locale: 'en', strength: 2 });
  if (existing) {
    if (!existing.isActive)
      throw new AppError(422, 'BAD_BRAND', 'This brand is not available', {
        brand: 'Brand unavailable',
      });
    return existing;
  }
  try {
    return await Brand.create({ name, slug: slugify(name) });
  } catch (err) {
    if (err?.code === 11000) {
      const again = await Brand.findOne({ $or: [{ name }, { slug: slugify(name) }] }).collation({
        locale: 'en',
        strength: 2,
      });
      if (again) return again;
    }
    throw err;
  }
}

// Loads the category chain and the rules that apply (regulation, device fields, handling).
async function resolveCategories(categoryId, subcategoryId) {
  const top = await Category.findById(categoryId);
  if (!top || !top.isActive || top.parent) {
    throw new AppError(422, 'BAD_CATEGORY', 'Choose an active top-level category', {
      categoryId: 'Invalid category',
    });
  }
  let sub = null;
  if (subcategoryId) {
    sub = await Category.findById(subcategoryId);
    if (!sub || !sub.isActive || String(sub.parent) !== String(top._id)) {
      throw new AppError(422, 'BAD_CATEGORY', 'Sub-category does not belong to that category', {
        subcategoryId: 'Invalid sub-category',
      });
    }
  }
  const leaf = sub ?? top;
  return {
    top,
    sub,
    leaf,
    regulation: sub
      ? sub.regulation === 'inherit'
        ? top.regulation
        : sub.regulation
      : top.regulation,
    deviceFields: leaf.deviceFields,
  };
}

async function findOrCreateProduct(user, input) {
  if (input.productId) {
    const p = await Product.findById(input.productId);
    if (!p) throw notFound('Product not found');
    return p;
  }
  const pi = input.product;
  const cats = await resolveCategories(pi.categoryId, pi.subcategoryId);
  const hasDevice = pi.model || pi.version || pi.deviceType;
  if (hasDevice && !cats.deviceFields) {
    throw new AppError(
      422,
      'DEVICE_FIELDS_NOT_ALLOWED',
      'Model, version and device type only apply to electronics and appliances',
      {
        model: 'Not applicable for this category',
      },
    );
  }
  const brand = await resolveBrand(pi.brand);
  const matchKey = normKey(brand?.name, pi.name, pi.model, pi.version);
  const doc = {
    name: pi.name,
    brandId: brand?._id,
    brandName: brand?.name,
    categoryId: cats.top._id,
    subcategoryId: cats.sub?._id,
    description: pi.description,
    model: pi.model,
    version: pi.version,
    deviceType: pi.deviceType,
    attributes: pi.attributes,
    matchKey,
    createdBy: user._id,
  };
  try {
    return await Product.findOneAndUpdate(
      { matchKey },
      { $setOnInsert: doc },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );
  } catch (err) {
    if (err?.code === 11000) return Product.findOne({ matchKey });
    throw err;
  }
}

function checkCompliance({ regulation }, profile, input, isNew) {
  const errors = {};
  if (regulation === 'food') {
    if (!profile.fssaiLicense)
      errors.compliance =
        'An FSSAI licence number is required on your shop profile to sell food products';
    if (isNew && !input.expiryDate)
      errors.expiryDate = 'Expiry or best-before date is required for food products';
  }
  if (regulation === 'medicine') {
    if (!profile.drugLicense)
      errors.compliance =
        'A drug licence number is required on your shop profile to sell medicines';
    if (input.prescriptionRequired === undefined && isNew)
      errors.prescriptionRequired = 'State whether a prescription is required';
    if (isNew && !input.expiryDate) errors.expiryDate = 'Expiry date is required for medicines';
  }
  if (regulation !== 'none' && input.expiryDate && new Date(input.expiryDate) <= new Date()) {
    errors.expiryDate = 'Expiry date must be in the future';
  }
  if (Object.keys(errors).length)
    throw new AppError(
      422,
      'COMPLIANCE_REQUIRED',
      'Regulated product requirements not met',
      errors,
    );
}

const computePublic = (l) => l.status === 'active' && l.catActive && l.vendorActive;

export async function createListing(user, input) {
  const profile = await VendorProfile.findOne({ userId: user._id });
  if (!profile?.shopName || !profile.pickupAddress?.pincode) {
    throw new AppError(
      409,
      'PROFILE_INCOMPLETE',
      'Complete your shop profile (name and pickup address) before listing products',
    );
  }
  if (input.mrpPaise < input.pricePaise) {
    throw new AppError(422, 'BAD_PRICE', 'MRP cannot be lower than the selling price', {
      mrpPaise: 'Must be at least the price',
    });
  }
  const product = await findOrCreateProduct(user, input);
  const cats = await resolveCategories(product.categoryId, product.subcategoryId);
  checkCompliance(cats, profile, input, true);

  const images = await claimImages(
    (input.images ?? []).map((i) => i.key),
    user._id,
    'listing',
  );
  const variant = input.variant ?? '';
  const title = variant ? `${product.name} - ${variant}` : product.name;
  const doc = {
    vendorId: user._id,
    productId: product._id,
    sku: input.sku,
    variant,
    slug: slugify(title),
    title,
    description: input.description ?? product.description,
    brandId: product.brandId,
    brandName: product.brandName,
    categoryId: cats.top._id,
    subcategoryId: cats.sub?._id,
    categoryName: cats.leaf.name,
    categorySlug: cats.leaf.slug,
    categoryPath: [cats.top._id, ...(cats.sub ? [cats.sub._id] : [])],
    gstPercent: cats.leaf.gstPercent,
    vendorName: profile.shopName,
    vendorSlug: profile.slug,
    attributes: input.attributes ?? product.attributes,
    pricePaise: input.pricePaise,
    mrpPaise: input.mrpPaise,
    stock: input.stock,
    images: images.map((a, i) => ({
      key: a.key,
      url: a.url,
      thumbUrl: a.thumbUrl,
      alt: input.images[i].alt,
    })),
    prescriptionRequired: cats.regulation === 'medicine' ? !!input.prescriptionRequired : false,
    expiryDate: input.expiryDate,
    catActive: true,
    vendorActive: user.status === 'active',
    searchDirty: searchEnabled(),
  };
  doc.isPublic = computePublic({ ...doc, status: 'active' });
  try {
    const listing = await Listing.create(doc);
    await catalogChanged();
    return listing;
  } catch (err) {
    if (err?.code === 11000) {
      const dupSku = /sku/.test(err.message);
      throw conflict(
        dupSku
          ? 'You already have a listing with this SKU'
          : 'You already list this product variant',
        dupSku ? 'SKU_TAKEN' : 'LISTING_EXISTS',
      );
    }
    throw err;
  }
}

export async function updateListing(user, listingId, input) {
  const listing = await Listing.findOne({ _id: listingId, vendorId: user._id });
  if (!listing) throw notFound('Listing not found');

  if (input.status && listing.status === 'hidden') {
    throw forbidden('This listing was hidden by an administrator', 'LISTING_HIDDEN');
  }
  const price = input.pricePaise ?? listing.pricePaise;
  const mrp = input.mrpPaise ?? listing.mrpPaise;
  if (mrp < price)
    throw new AppError(422, 'BAD_PRICE', 'MRP cannot be lower than the selling price', {
      mrpPaise: 'Must be at least the price',
    });

  if (input.expiryDate !== undefined || input.prescriptionRequired !== undefined) {
    const cats = await resolveCategories(listing.categoryPath[0], listing.categoryPath[1]);
    const profile = await VendorProfile.findOne({ userId: user._id });
    checkCompliance(
      cats,
      profile,
      {
        expiryDate: input.expiryDate ?? listing.expiryDate,
        prescriptionRequired: input.prescriptionRequired ?? listing.prescriptionRequired,
      },
      false,
    );
  }

  let removedKeys = [];
  if (input.images) {
    const keys = input.images.map((i) => i.key);
    const existing = new Set(listing.images.map((i) => i.key));
    const fresh = keys.filter((k) => !existing.has(k));
    const claimed = await claimImages(fresh, user._id, 'listing');
    const byKey = new Map([
      ...listing.images.map((i) => [i.key, i]),
      ...claimed.map((a) => [a.key, { key: a.key, url: a.url, thumbUrl: a.thumbUrl }]),
    ]);
    removedKeys = [...existing].filter((k) => !keys.includes(k));
    listing.images = input.images.map((i) => ({ ...byKey.get(i.key), alt: i.alt }));
  }

  for (const k of [
    'pricePaise',
    'mrpPaise',
    'stock',
    'manualOutOfStock',
    'status',
    'description',
    'prescriptionRequired',
    'expiryDate',
    'attributes',
  ]) {
    if (input[k] !== undefined) listing[k] = input[k];
  }
  if (input.sku) listing.sku = input.sku;
  listing.isPublic = computePublic(listing);
  listing.searchDirty = searchEnabled();
  try {
    await listing.save();
  } catch (err) {
    if (err?.code === 11000)
      throw conflict('You already have a listing with this SKU', 'SKU_TAKEN');
    throw err;
  }
  for (const k of removedKeys) await releaseImage(k);
  await catalogChanged();
  return listing;
}

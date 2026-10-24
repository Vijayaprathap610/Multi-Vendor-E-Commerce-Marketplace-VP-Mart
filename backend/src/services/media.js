import crypto from 'node:crypto';
import sharp from 'sharp';
import Banner from '../models/Banner.js';
import Brand from '../models/Brand.js';
import Category from '../models/Category.js';
import Listing from '../models/Listing.js';
import MediaAsset from '../models/MediaAsset.js';
import VendorProfile from '../models/VendorProfile.js';
import { AppError, forbidden } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { storage } from './storage.js';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(['jpeg', 'png', 'webp']);
const MAX_WIDTH = { listing: 1600, logo: 600, banner: 2000, category: 800, brand: 600 };

// The file type is decided by decoding the bytes (not by the client's mimetype or filename), and
// the image is re-encoded to WebP which drops metadata and any non-image payload.
export async function processImage(buffer, purpose) {
  let meta;
  try {
    meta = await sharp(buffer, { limitInputPixels: 40_000_000 }).metadata();
  } catch {
    throw new AppError(415, 'BAD_IMAGE', 'File is not a valid image');
  }
  if (!ALLOWED.has(meta.format)) {
    throw new AppError(415, 'BAD_IMAGE_TYPE', 'Only JPEG, PNG or WebP images are allowed');
  }
  const base = sharp(buffer, { limitInputPixels: 40_000_000 }).rotate();
  const main = await base
    .clone()
    .resize({ width: MAX_WIDTH[purpose], withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  const thumb = await base
    .clone()
    .resize({ width: 400, withoutEnlargement: true })
    .webp({ quality: 74 })
    .toBuffer();
  return { main, thumb };
}

export async function saveUpload({ buffer, ownerId, purpose }) {
  const { main, thumb } = await processImage(buffer, purpose);
  const id = crypto.randomUUID();
  const key = `${purpose}/${ownerId}/${id}.webp`;
  const thumbKey = `${purpose}/${ownerId}/${id}.thumb.webp`;
  const s = storage();
  await s.put(key, main, 'image/webp');
  try {
    await s.put(thumbKey, thumb, 'image/webp');
  } catch (err) {
    await s.remove(key).catch(() => {});
    throw err;
  }
  return MediaAsset.create({
    key,
    thumbKey,
    url: s.urlFor(key),
    thumbUrl: s.urlFor(thumbKey),
    ownerId,
    purpose,
    bytes: main.length,
  });
}

// Verifies that every key was uploaded by this owner for this purpose, then marks it attached.
export async function claimImages(keys, ownerId, purpose, { isAdmin = false } = {}) {
  if (!keys.length) return [];
  const assets = await MediaAsset.find({ key: { $in: keys } });
  const byKey = new Map(assets.map((a) => [a.key, a]));
  for (const k of keys) {
    const a = byKey.get(k);
    if (!a || a.purpose !== purpose || (!isAdmin && String(a.ownerId) !== String(ownerId))) {
      throw forbidden('One or more images are invalid or not yours', 'IMAGE_NOT_OWNED');
    }
  }
  await MediaAsset.updateMany(
    { key: { $in: keys }, attachedAt: { $exists: false } },
    { attachedAt: new Date() },
  );
  return keys.map((k) => byKey.get(k));
}

export async function isReferenced(key) {
  const checks = await Promise.all([
    Listing.exists({ 'images.key': key }),
    Banner.exists({ imageKey: key }),
    VendorProfile.exists({ logoKey: key }),
    Category.exists({ imageKey: key }),
    Brand.exists({ logoKey: key }),
  ]);
  return checks.some(Boolean);
}

// Deletes the stored objects only when nothing references the image any more.
export async function releaseImage(key) {
  if (!key) return { deleted: false, reason: 'no-key' };
  if (await isReferenced(key)) return { deleted: false, reason: 'still-referenced' };
  const asset = await MediaAsset.findOne({ key });
  const s = storage();
  try {
    await s.remove(key);
    if (asset?.thumbKey) await s.remove(asset.thumbKey);
  } catch (err) {
    logger.error({ err, key }, 'failed to delete image object');
    return { deleted: false, reason: 'storage-error' };
  }
  if (asset) await MediaAsset.deleteOne({ _id: asset._id });
  return { deleted: true };
}

export async function cleanupUnattached(olderThanHours = 24) {
  const cutoff = new Date(Date.now() - olderThanHours * 3600 * 1000);
  const stale = await MediaAsset.find({
    attachedAt: { $exists: false },
    createdAt: { $lt: cutoff },
  }).limit(500);
  let deleted = 0;
  for (const a of stale) if ((await releaseImage(a.key)).deleted) deleted++;
  return { scanned: stale.length, deleted };
}

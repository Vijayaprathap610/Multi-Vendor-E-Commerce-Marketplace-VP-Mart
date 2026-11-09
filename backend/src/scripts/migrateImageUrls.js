import { connectDb, disconnectDb } from '../config/db.js';
import Banner from '../models/Banner.js';
import MediaAsset from '../models/MediaAsset.js';
import Listing from '../models/Listing.js';
import Category from '../models/Category.js';
import Brand from '../models/Brand.js';
import VendorProfile from '../models/VendorProfile.js';

const TARGET_HOST = 'https://multi-vendor-e-commerce-marketplace-vp.onrender.com';
const OLD_PREFIX = 'http://localhost:5000/uploads/';
const NEW_PREFIX = `${TARGET_HOST}/uploads/`;

const fix = (str) => {
  if (typeof str !== 'string') return str;
  if (str.startsWith(OLD_PREFIX)) {
    return str.replace(OLD_PREFIX, NEW_PREFIX);
  }
  return str;
};

async function run() {
  await connectDb();
  console.log('Connected to MongoDB. Starting image URL migration...\n');

  // 1. Banners
  const banners = await Banner.find({ imageUrl: { $regex: '^http://localhost:5000' } });
  let bannerCount = 0;
  for (const b of banners) {
    b.imageUrl = fix(b.imageUrl);
    await b.save();
    bannerCount++;
  }
  console.log(`✓ Migrated ${bannerCount} Banner records`);

  // 2. MediaAssets
  const media = await MediaAsset.find({
    $or: [
      { url: { $regex: '^http://localhost:5000' } },
      { thumbUrl: { $regex: '^http://localhost:5000' } },
    ],
  });
  let mediaCount = 0;
  for (const m of media) {
    m.url = fix(m.url);
    if (m.thumbUrl) m.thumbUrl = fix(m.thumbUrl);
    await m.save();
    mediaCount++;
  }
  console.log(`✓ Migrated ${mediaCount} MediaAsset records`);

  // 3. Listings
  const listings = await Listing.find({
    $or: [
      { 'images.url': { $regex: '^http://localhost:5000' } },
      { 'images.thumbUrl': { $regex: '^http://localhost:5000' } },
    ],
  });
  let listingCount = 0;
  for (const l of listings) {
    let changed = false;
    for (const img of l.images) {
      if (img.url?.startsWith(OLD_PREFIX)) {
        img.url = fix(img.url);
        changed = true;
      }
      if (img.thumbUrl?.startsWith(OLD_PREFIX)) {
        img.thumbUrl = fix(img.thumbUrl);
        changed = true;
      }
    }
    if (changed) {
      await l.save();
      listingCount++;
    }
  }
  console.log(`✓ Migrated ${listingCount} Listing records`);

  // 4. Categories
  const categories = await Category.find({ imageUrl: { $regex: '^http://localhost:5000' } });
  let catCount = 0;
  for (const c of categories) {
    c.imageUrl = fix(c.imageUrl);
    await c.save();
    catCount++;
  }
  console.log(`✓ Migrated ${catCount} Category records`);

  // 5. Brands
  const brands = await Brand.find({ logoUrl: { $regex: '^http://localhost:5000' } });
  let brandCount = 0;
  for (const b of brands) {
    b.logoUrl = fix(b.logoUrl);
    await b.save();
    brandCount++;
  }
  console.log(`✓ Migrated ${brandCount} Brand records`);

  // 6. VendorProfiles
  const vendors = await VendorProfile.find({ logoUrl: { $regex: '^http://localhost:5000' } });
  let vendorCount = 0;
  for (const v of vendors) {
    v.logoUrl = fix(v.logoUrl);
    await v.save();
    vendorCount++;
  }
  console.log(`✓ Migrated ${vendorCount} VendorProfile records\n`);

  console.log('Image URL migration complete!');
  await disconnectDb();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

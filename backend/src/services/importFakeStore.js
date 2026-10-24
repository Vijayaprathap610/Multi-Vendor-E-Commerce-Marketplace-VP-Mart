import crypto from 'node:crypto';
import { z } from 'zod';
import Category from '../models/Category.js';
import Listing from '../models/Listing.js';
import User from '../models/User.js';
import VendorProfile from '../models/VendorProfile.js';
import { createListing } from './listingService.js';
import { MAX_UPLOAD_BYTES, saveUpload } from './media.js';
import { hashPassword } from './userService.js';

// One-time, explicitly invoked import of sample products from the Fake Store API.
// It is never called by the running application. Prices there are USD; they are converted with
// a configurable rate. Ratings from the source are intentionally NOT imported (no fake reviews).
export const CATEGORY_MAP = {
  "men's clothing": { top: 'fashion', sub: 'mens-clothing' },
  "women's clothing": { top: 'fashion', sub: 'womens-clothing' },
  jewelery: { top: 'fashion', sub: 'jewellery-watches' },
  electronics: { top: 'electronics', sub: 'electronic-accessories' },
};
export const VENDOR_EMAIL = 'fakestore.vendor@example.invalid';

const recordSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().trim().min(2).max(160),
  price: z.number().positive().max(1_000_000),
  description: z.string().trim().max(4000).optional().default(''),
  category: z.string().trim().toLowerCase(),
  image: z.string().url(),
});

async function ensureVendor() {
  let user = await User.findOne({ email: VENDOR_EMAIL });
  if (!user) {
    user = await User.create({
      name: 'Fake Store Demo Vendor',
      email: VENDOR_EMAIL,
      role: 'vendor',
      status: 'active',
      // Random password nobody knows: this account exists only to own the sample listings.
      passwordHash: await hashPassword(crypto.randomBytes(24).toString('hex')),
    });
  }
  await VendorProfile.updateOne(
    { userId: user._id },
    {
      $setOnInsert: {
        shopName: 'Fake Store Samples',
        slug: 'fake-store-samples',
        businessName: 'Fake Store Samples (demo data)',
        description: 'Sample products imported from the Fake Store API for demonstration.',
        pickupAddress: {
          line1: 'Demo Warehouse',
          city: 'Chennai',
          state: 'Tamil Nadu',
          pincode: '600001',
        },
        payout: { accountHolder: 'Demo', accountLast4: '0000', ifsc: 'DEMO0000000' },
        submittedAt: new Date(),
      },
    },
    { upsert: true },
  );
  return user;
}

async function fetchImage(url, { allowHttp, fetchImpl }) {
  if (!allowHttp && !url.startsWith('https://')) throw new Error('image URL must be https');
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`image HTTP ${res.status}`);
  if (!(res.headers.get('content-type') || '').startsWith('image/'))
    throw new Error('not an image');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_UPLOAD_BYTES) throw new Error('image too large');
  return buf;
}

export async function importFakeStore({
  url = 'https://fakestoreapi.com/products',
  usdToInr = 83,
  allowHttp = false,
  stock = 25,
  fetchImpl = fetch,
} = {}) {
  const report = { fetched: 0, imported: 0, skipped: 0, failed: 0, imageFailed: 0, errors: [] };
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Fake Store API responded with HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error('Unexpected response shape from Fake Store API');
  report.fetched = rows.length;

  const vendor = await ensureVendor();
  for (const raw of rows) {
    const parsed = recordSchema.safeParse(raw);
    if (!parsed.success) {
      report.failed++;
      report.errors.push(`record ${raw?.id ?? '?'}: ${parsed.error.issues[0].message}`);
      continue;
    }
    const r = parsed.data;
    const map = CATEGORY_MAP[r.category];
    if (!map) {
      report.failed++;
      report.errors.push(`record ${r.id}: unmapped category "${r.category}"`);
      continue;
    }
    const sku = `FS-${r.id}`;
    if (await Listing.exists({ vendorId: vendor._id, sku })) {
      report.skipped++;
      continue;
    }
    try {
      const [top, sub] = await Promise.all([
        Category.findOne({ slug: map.top }),
        Category.findOne({ slug: map.sub }),
      ]);
      if (!top || !sub)
        throw new Error('categories are not seeded; run `npm run seed:catalog` first');
      let images = [];
      try {
        const asset = await saveUpload({
          buffer: await fetchImage(r.image, { allowHttp, fetchImpl }),
          ownerId: vendor._id,
          purpose: 'listing',
        });
        images = [{ key: asset.key, alt: r.title }];
      } catch (err) {
        report.imageFailed++;
        report.errors.push(`record ${r.id}: image skipped (${err.message})`);
      }
      const paise = Math.max(100, Math.round(r.price * usdToInr * 100));
      await createListing(vendor, {
        product: {
          name: r.title,
          categoryId: String(top._id),
          subcategoryId: String(sub._id),
          description: r.description,
        },
        sku,
        pricePaise: paise,
        mrpPaise: paise,
        stock,
        images,
      });
      report.imported++;
    } catch (err) {
      report.failed++;
      report.errors.push(`record ${r.id}: ${err.message}`);
    }
  }
  report.vendorListingsInDb = await Listing.countDocuments({ vendorId: vendor._id, sku: /^FS-/ });
  return report;
}

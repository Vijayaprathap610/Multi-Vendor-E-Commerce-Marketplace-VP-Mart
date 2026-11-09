import crypto from 'node:crypto';
import mongoose from 'mongoose';
import sharp from 'sharp';
import Banner from '../models/Banner.js';
import Category from '../models/Category.js';
import Listing from '../models/Listing.js';
import MediaAsset from '../models/MediaAsset.js';
import User from '../models/User.js';
import { catalogChanged } from '../services/cache.js';
import { saveUpload } from '../services/media.js';
import { storage } from '../services/storage.js';

// High quality, direct, curated product photography URLs from Unsplash
export const PRODUCT_IMAGE_URLS = {
  'Linen Blend Shirt': 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=900&auto=format&fit=crop&q=80',
  'Slim Fit Chinos': 'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=900&auto=format&fit=crop&q=80',
  'Cotton Kurta Set': 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=900&auto=format&fit=crop&q=80',
  'Everyday Running Shoes': 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=900&auto=format&fit=crop&q=80',
  'Canvas Weekender Bag': 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=900&auto=format&fit=crop&q=80',
  'Minimal Analog Watch': 'https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=900&auto=format&fit=crop&q=80',
  'Nova 5G 128GB': 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=900&auto=format&fit=crop&q=80',
  'Pulse Lite 64GB': 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=900&auto=format&fit=crop&q=80',
  'Wireless Over-Ear Headphones': 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=900&auto=format&fit=crop&q=80',
  'Slate 14 Laptop 8GB/512GB': 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=900&auto=format&fit=crop&q=80',
  'FitBand 3 Tracker': 'https://images.unsplash.com/photo-1575311373937-040b8e1fd5b6?w=900&auto=format&fit=crop&q=80',
  'Sona Masoori Rice 5kg': 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=900&auto=format&fit=crop&q=80',
  'Garam Masala 100g': 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=900&auto=format&fit=crop&q=80',
  'Assam Tea 500g': 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=900&auto=format&fit=crop&q=80',
  'Dark Chocolate Bar 100g': 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=900&auto=format&fit=crop&q=80',
  'Vanilla Bean Ice Cream 700ml': 'https://images.unsplash.com/photo-1570197788417-0e82375c9371?w=900&auto=format&fit=crop&q=80',
  'Chocolate Cone (pack of 4)': 'https://images.unsplash.com/photo-1501443762994-82bd5dace89a?w=900&auto=format&fit=crop&q=80',
  'Paracetamol 500mg (15 tablets)': 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=900&auto=format&fit=crop&q=80',
  'Digital Thermometer': 'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?w=900&auto=format&fit=crop&q=80',
  'Ergonomic Mesh Office Chair': 'https://images.unsplash.com/photo-1592078615290-033ee584e267?w=900&auto=format&fit=crop&q=80',
  '5-Tier Bookshelf': 'https://images.unsplash.com/photo-1594980596870-8aa52a78d8cd?w=900&auto=format&fit=crop&q=80',
  'Ceramic Table Vase': 'https://images.unsplash.com/photo-1612196808214-b8e1d6145a8c?w=900&auto=format&fit=crop&q=80',
  'Cotton Bedsheet Set (Double)': 'https://images.unsplash.com/photo-1616046229478-9901c5536a45?w=900&auto=format&fit=crop&q=80',
  'Cast Iron Dosa Tawa 28cm': 'https://images.unsplash.com/photo-1590794056226-79ef3a8147e1?w=900&auto=format&fit=crop&q=80',
  'Steel Lunch Box (3 tier)': 'https://images.unsplash.com/photo-1584269600464-37b1b58a9fe7?w=900&auto=format&fit=crop&q=80',
  'Gentle Baby Wash 200ml': 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=900&auto=format&fit=crop&q=80',
  '500-Piece Jigsaw Puzzle': 'https://images.unsplash.com/photo-1585366119957-e9730b6d0f60?w=900&auto=format&fit=crop&q=80',
  'Wooden Building Blocks (100 pcs)': 'https://images.unsplash.com/photo-1587654780291-39c9404d746b?w=900&auto=format&fit=crop&q=80',
  'A5 Ruled Notebook (pack of 3)': 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=900&auto=format&fit=crop&q=80',
  'Vitamin C Face Serum 30ml': 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=900&auto=format&fit=crop&q=80',
  'Non-Slip Yoga Mat 6mm': 'https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?w=900&auto=format&fit=crop&q=80',
  'Mixer Grinder 750W': 'https://images.unsplash.com/photo-1570222094114-d054a817e56b?w=900&auto=format&fit=crop&q=80',
  'Chew Toy Rope Set': 'https://images.unsplash.com/photo-1576201836106-db1758fd1c97?w=900&auto=format&fit=crop&q=80',
  'Microfibre Car Cleaning Kit': 'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?w=900&auto=format&fit=crop&q=80',
  'Terracotta Planter Set (3)': 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?w=900&auto=format&fit=crop&q=80',
};

export const BANNER_IMAGE_URLS = {
  'Festive Fashion Sale (demo)': 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1600&auto=format&fit=crop&q=80',
  'New phones, new prices (demo)': 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=1600&auto=format&fit=crop&q=80',
  'Fresh pantry restock (demo)': 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=1600&auto=format&fit=crop&q=80',
};

export const CATEGORY_IMAGE_URLS = {
  fashion: 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=400&auto=format&fit=crop&q=80',
  electronics: 'https://images.unsplash.com/photo-1550009158-9ebf69173e03?w=400&auto=format&fit=crop&q=80',
  groceries: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=400&auto=format&fit=crop&q=80',
  'food-beverages': 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=400&auto=format&fit=crop&q=80',
  'ice-cream': 'https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?w=400&auto=format&fit=crop&q=80',
  'medicines-healthcare': 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&auto=format&fit=crop&q=80',
  furniture: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400&auto=format&fit=crop&q=80',
  'home-kitchen': 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=400&auto=format&fit=crop&q=80',
  'beauty-personal-care': 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=400&auto=format&fit=crop&q=80',
  'sports-fitness': 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=400&auto=format&fit=crop&q=80',
  'toys-games': 'https://images.unsplash.com/photo-1558060370-d644479cb6f7?w=400&auto=format&fit=crop&q=80',
  'books-stationery': 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400&auto=format&fit=crop&q=80',
};

async function downloadBuffer(url) {
  const resp = await fetch(url, { headers: { 'User-Agent': 'VPMart-Seed/1.0' } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  const ab = await resp.arrayBuffer();
  return Buffer.from(ab);
}

export async function updateProductImages() {
  console.log('--- Updating product images with professional photography ---');
  const listings = await Listing.find().lean();
  let updatedCount = 0;

  for (const l of listings) {
    // Find matching URL by checking if the listing title begins with or matches any key
    let targetUrl = null;
    for (const [name, url] of Object.entries(PRODUCT_IMAGE_URLS)) {
      if (l.title.toLowerCase().includes(name.toLowerCase())) {
        targetUrl = url;
        break;
      }
    }

    if (!targetUrl) {
      console.log(`[SKIP] No matching URL found for "${l.title}"`);
      continue;
    }

    try {
      console.log(`[DOWNLOADING] "${l.title}" from Unsplash...`);
      const buffer = await downloadBuffer(targetUrl);
      const asset = await saveUpload({
        buffer,
        ownerId: l.vendorId,
        purpose: 'listing',
      });

      await Listing.updateOne(
        { _id: l._id },
        {
          $set: {
            images: [
              {
                key: asset.key,
                url: asset.url,
                thumbUrl: asset.thumbUrl,
                alt: l.title,
              },
            ],
          },
        },
      );
      updatedCount++;
      console.log(`[OK] Updated "${l.title}" -> ${asset.url}`);
    } catch (err) {
      console.error(`[ERROR] Failed to update "${l.title}":`, err.message);
    }
  }

  // Also update Banners
  console.log('\n--- Updating banner images ---');
  const banners = await Banner.find().lean();
  for (const b of banners) {
    const bannerUrl = BANNER_IMAGE_URLS[b.title];
    if (bannerUrl) {
      try {
        console.log(`[DOWNLOADING BANNER] "${b.title}"...`);
        const buffer = await downloadBuffer(bannerUrl);
        const asset = await saveUpload({
          buffer,
          ownerId: b.createdBy,
          purpose: 'banner',
        });
        await Banner.updateOne(
          { _id: b._id },
          {
            $set: {
              imageKey: asset.key,
              imageUrl: asset.url,
            },
          },
        );
        console.log(`[OK] Updated banner "${b.title}"`);
      } catch (err) {
        console.error(`[ERROR] Failed to update banner "${b.title}":`, err.message);
      }
    }
  }

  // Also update Categories
  console.log('\n--- Updating category images ---');
  const categories = await Category.find({ parent: null }).lean();
  const admin = await User.findOne({ role: 'admin' }).lean();
  const fallbackOwner = admin?._id || listings[0]?.vendorId;

  for (const c of categories) {
    const catUrl = CATEGORY_IMAGE_URLS[c.slug];
    if (catUrl) {
      try {
        console.log(`[DOWNLOADING CATEGORY] "${c.name}"...`);
        const buffer = await downloadBuffer(catUrl);
        const asset = await saveUpload({
          buffer,
          ownerId: fallbackOwner,
          purpose: 'category',
        });
        await Category.updateOne(
          { _id: c._id },
          {
            $set: {
              imageKey: asset.key,
              imageUrl: asset.url,
            },
          },
        );
        console.log(`[OK] Updated category "${c.name}"`);
      } catch (err) {
        console.error(`[ERROR] Failed to update category "${c.name}":`, err.message);
      }
    }
  }

  await catalogChanged();
  console.log(`\nDONE: Successfully updated ${updatedCount} listings with real product images!`);
}

// Allow direct CLI invocation
if (process.argv[1]?.endsWith('updateProductImages.js')) {
  import('../config/db.js').then(async ({ connectDb }) => {
    await connectDb();
    await updateProductImages();
    await mongoose.disconnect();
    process.exit(0);
  });
}

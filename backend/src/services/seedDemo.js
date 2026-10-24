import sharp from 'sharp';
import Banner from '../models/Banner.js';
import Category from '../models/Category.js';
import Listing from '../models/Listing.js';
import Review from '../models/Review.js';
import User from '../models/User.js';
import VendorProfile from '../models/VendorProfile.js';
import { catalogChanged } from './cache.js';
import { createListing } from './listingService.js';
import { claimImages, saveUpload } from './media.js';
import { hashPassword } from './userService.js';

// DEMO DATA ONLY. Everything here is invented for demonstrations and screenshots:
// shops, products, prices, units-sold counters and reviews. Real numbers come from real orders.
export const DEMO_PASSWORD = 'Demo@12345678';
const DAY = 86400000;
const future = (d) => new Date(Date.now() + d * DAY);

const VENDORS = [
  {
    key: 'v1',
    name: 'Kaveri Retail',
    shop: 'Kaveri Retail',
    city: 'Coimbatore',
    state: 'Tamil Nadu',
    pin: '641001',
    ship: 4900,
    free: 99900,
    days: 1,
    lic: true,
  },
  {
    key: 'v2',
    name: 'Marina Traders',
    shop: 'Marina Traders',
    city: 'Chennai',
    state: 'Tamil Nadu',
    pin: '600001',
    ship: 3900,
    free: 79900,
    days: 1,
    lic: true,
  },
  {
    key: 'v3',
    name: 'Gateway Goods',
    shop: 'Gateway Goods',
    city: 'Mumbai',
    state: 'Maharashtra',
    pin: '400001',
    ship: 5900,
    free: 129900,
    days: 2,
    lic: false,
  },
  {
    key: 'v4',
    name: 'Capital Choice',
    shop: 'Capital Choice',
    city: 'New Delhi',
    state: 'Delhi',
    pin: '110001',
    ship: 4500,
    free: 99900,
    days: 2,
    lic: false,
  },
];

// [vendor, topSlug, subSlug, name, brand, price, mrp, stock, sold, extra]
const R = (v, top, sub, name, brand, price, mrp, stock, sold, extra = {}) => ({
  v,
  top,
  sub,
  name,
  brand,
  price,
  mrp,
  stock,
  sold,
  extra,
});
const exp = future(120);
const ITEMS = [
  R('v1', 'fashion', 'mens-clothing', 'Linen Blend Shirt', 'Loomcraft', 1299, 1999, 40, 120, {
    variant: 'Blue, M',
  }),
  R('v1', 'fashion', 'mens-clothing', 'Slim Fit Chinos', 'Loomcraft', 1599, 1599, 25, 64),
  R('v2', 'fashion', 'womens-clothing', 'Cotton Kurta Set', 'Kaveri Weaves', 1899, 2999, 30, 210, {
    variant: 'Maroon, L',
  }),
  R('v2', 'fashion', 'footwear', 'Everyday Running Shoes', 'Northpeak', 2499, 3499, 18, 88),
  R('v3', 'fashion', 'bags-accessories', 'Canvas Weekender Bag', 'Northpeak', 1799, 2299, 0, 40),
  R('v4', 'fashion', 'jewellery-watches', 'Minimal Analog Watch', 'Tickwell', 3299, 4999, 12, 51),
  R('v1', 'electronics', 'mobiles', 'Nova 5G 128GB', 'Novatech', 18999, 21999, 22, 310, {
    product: { model: 'N5', version: 'Gen 2', deviceType: 'Smartphone' },
    variant: '128GB, Graphite',
  }),
  R('v2', 'electronics', 'mobiles', 'Pulse Lite 64GB', 'Pulse', 9499, 10999, 35, 190, {
    product: { model: 'PL', version: 'Gen 1', deviceType: 'Smartphone' },
    variant: '64GB, Blue',
  }),
  R(
    'v3',
    'electronics',
    'audio-headphones',
    'Wireless Over-Ear Headphones',
    'Spark Audio',
    3499,
    5999,
    27,
    140,
    { product: { model: 'SA-700', deviceType: 'Headphones' } },
  ),
  R(
    'v4',
    'electronics',
    'laptops-computers',
    'Slate 14 Laptop 8GB/512GB',
    'Novatech',
    45999,
    52999,
    9,
    33,
    { product: { model: 'S14', version: '2026', deviceType: 'Laptop' } },
  ),
  R('v2', 'electronics', 'wearables', 'FitBand 3 Tracker', 'Pulse', 1999, 2999, 60, 175, {
    product: { model: 'FB3', deviceType: 'Fitness band' },
  }),
  R(
    'v1',
    'groceries',
    'staples-grains',
    'Sona Masoori Rice 5kg',
    'Annapurna Foods',
    449,
    499,
    80,
    260,
    { expiryDate: exp },
  ),
  R(
    'v1',
    'groceries',
    'spices-masalas',
    'Garam Masala 100g',
    'Annapurna Foods',
    89,
    110,
    120,
    340,
    { expiryDate: exp },
  ),
  R('v2', 'food-beverages', 'tea-coffee', 'Assam Tea 500g', 'Chai Harvest', 299, 349, 70, 150, {
    expiryDate: exp,
  }),
  R(
    'v2',
    'food-beverages',
    'sweets-chocolates',
    'Dark Chocolate Bar 100g',
    'Cocoa Lane',
    149,
    149,
    90,
    95,
    { expiryDate: exp },
  ),
  R(
    'v1',
    'ice-cream',
    'ice-cream-tubs',
    'Vanilla Bean Ice Cream 700ml',
    'Frostbite Creamery',
    249,
    249,
    40,
    400,
    { expiryDate: exp },
  ),
  R(
    'v1',
    'ice-cream',
    'ice-cream-cones-bars',
    'Chocolate Cone (pack of 4)',
    'Frostbite Creamery',
    199,
    249,
    55,
    180,
    { expiryDate: exp },
  ),
  R(
    'v2',
    'medicines-healthcare',
    'otc-medicines',
    'Paracetamol 500mg (15 tablets)',
    'WellNest',
    35,
    40,
    200,
    500,
    { expiryDate: exp, prescriptionRequired: false },
  ),
  R(
    'v2',
    'medicines-healthcare',
    'health-devices',
    'Digital Thermometer',
    'WellNest',
    299,
    449,
    45,
    70,
  ),
  R(
    'v3',
    'furniture',
    'office-furniture',
    'Ergonomic Mesh Office Chair',
    'Hearth & Co',
    7999,
    12999,
    8,
    22,
  ),
  R('v4', 'furniture', 'storage-shelves', '5-Tier Bookshelf', 'Hearth & Co', 4599, 5999, 14, 31),
  R('v3', 'home-kitchen', 'home-decor', 'Ceramic Table Vase', 'Hearth & Co', 699, 999, 50, 44),
  R(
    'v4',
    'home-kitchen',
    'bedding-linen',
    'Cotton Bedsheet Set (Double)',
    'Loomcraft',
    999,
    1799,
    38,
    96,
  ),
  R(
    'v3',
    'vessels-kitchenware',
    'cookware',
    'Cast Iron Dosa Tawa 28cm',
    'Kitchen Forge',
    899,
    1199,
    33,
    120,
  ),
  R(
    'v3',
    'vessels-kitchenware',
    'kitchen-containers',
    'Steel Lunch Box (3 tier)',
    'Kitchen Forge',
    549,
    699,
    64,
    85,
  ),
  R('v4', 'kids-baby', 'baby-care', 'Gentle Baby Wash 200ml', 'Little Leaf', 249, 299, 90, 130),
  R(
    'v4',
    'toys-games',
    'board-games-puzzles',
    '500-Piece Jigsaw Puzzle',
    'Playhive',
    499,
    799,
    42,
    60,
  ),
  R(
    'v4',
    'toys-games',
    'educational-toys',
    'Wooden Building Blocks (100 pcs)',
    'Playhive',
    799,
    1099,
    36,
    72,
  ),
  R(
    'v2',
    'books-stationery',
    'notebooks-paper',
    'A5 Ruled Notebook (pack of 3)',
    'Paperly',
    199,
    249,
    150,
    210,
  ),
  R(
    'v3',
    'beauty-personal-care',
    'skincare',
    'Vitamin C Face Serum 30ml',
    'Glowdrop',
    599,
    899,
    48,
    160,
  ),
  R(
    'v3',
    'sports-fitness',
    'yoga-wellness',
    'Non-Slip Yoga Mat 6mm',
    'Stretchwell',
    799,
    1299,
    52,
    98,
  ),
  R(
    'v4',
    'home-appliances',
    'kitchen-appliances',
    'Mixer Grinder 750W',
    'Brewline',
    3299,
    4299,
    17,
    77,
    { product: { model: 'MG-750', deviceType: 'Mixer grinder' } },
  ),
  R('v3', 'pet-supplies', 'dog-supplies', 'Chew Toy Rope Set', 'Pawsome', 299, 399, 70, 54),
  R(
    'v4',
    'automotive-accessories',
    'car-accessories',
    'Microfibre Car Cleaning Kit',
    'Roadready',
    649,
    999,
    26,
    38,
  ),
  R(
    'v4',
    'garden-outdoor',
    'planters-pots',
    'Terracotta Planter Set (3)',
    'Greenhouse Co',
    699,
    899,
    31,
    47,
  ),
];

const PALETTE = {
  fashion: ['#1b4fd8', '#e8eefc'],
  electronics: ['#14171c', '#e9ebef'],
  groceries: ['#2b8a3e', '#e8f5ec'],
  'food-beverages': ['#b4590a', '#fbeede'],
  'ice-cream': ['#c2255c', '#fde8f0'],
  'medicines-healthcare': ['#0b7285', '#e3f6f9'],
  furniture: ['#5f3dc4', '#eeeafc'],
  'home-kitchen': ['#a61e4d', '#fbe9f0'],
  'vessels-kitchenware': ['#495057', '#eceeef'],
  'kids-baby': ['#e67700', '#fff3de'],
  'toys-games': ['#d62839', '#fdeaec'],
  'books-stationery': ['#364fc7', '#e8ebfb'],
  'beauty-personal-care': ['#c92a7a', '#fce9f3'],
  'sports-fitness': ['#087f5b', '#e3f5ee'],
  'home-appliances': ['#1864ab', '#e5f0fb'],
  'pet-supplies': ['#9c6b00', '#fbf1d9'],
  'automotive-accessories': ['#343a40', '#eaecee'],
  'garden-outdoor': ['#2f9e44', '#e9f6ec'],
};
const esc = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Draws a plain illustrative tile for each demo product (not a photograph).
async function productImage(name, top, w = 900, h = 900) {
  const [ink, bg] = PALETTE[top] ?? ['#14171c', '#eceff3'];
  const initials = name
    .split(/\s+/)
    .filter((x) => /[A-Za-z]/.test(x[0]))
    .slice(0, 2)
    .map((x) => x[0].toUpperCase())
    .join('');
  const words = name.split(' ');
  const mid = Math.ceil(words.length / 2);
  const lines =
    words.length > 3 ? [words.slice(0, mid).join(' '), words.slice(mid).join(' ')] : [name];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${bg}"/><circle cx="${w * 0.5}" cy="${h * 0.42}" r="${w * 0.24}" fill="${ink}"/><text x="50%" y="${h * 0.42 + w * 0.09}" font-family="DejaVu Sans, Arial, sans-serif" font-weight="700" font-size="${w * 0.24}" fill="${bg}" text-anchor="middle">${esc(initials)}</text>${lines.map((l, i) => `<text x="50%" y="${h * 0.8 + i * w * 0.06}" font-family="DejaVu Sans, Arial, sans-serif" font-weight="600" font-size="${w * 0.05}" fill="${ink}" text-anchor="middle">${esc(l)}</text>`).join('')}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function bannerImage(title, sub, color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="520"><rect width="100%" height="100%" fill="${color}"/><circle cx="1400" cy="120" r="260" fill="#ffffff" opacity="0.09"/><circle cx="1180" cy="470" r="180" fill="#ffffff" opacity="0.07"/><text x="90" y="250" font-family="DejaVu Sans, Arial, sans-serif" font-weight="800" font-size="84" fill="#ffffff">${esc(title)}</text><text x="90" y="330" font-family="DejaVu Sans, Arial, sans-serif" font-size="38" fill="#ffffff" opacity="0.9">${esc(sub)}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function seedDemo({ allowProduction = false } = {}) {
  if (process.env.NODE_ENV === 'production' && !allowProduction)
    throw new Error('Demo data cannot be seeded in production.');
  const report = { vendors: 0, listings: 0, buyers: 0, reviews: 0, banners: 0, skipped: false };
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const vendorUsers = {};
  for (const v of VENDORS) {
    const email = `demo.${v.key}@vpmart.example`;
    let u = await User.findOne({ email });
    if (!u) {
      u = await User.create({
        name: v.name,
        email,
        role: 'vendor',
        status: 'active',
        passwordHash,
        passwordChangedAt: new Date(),
      });
      await VendorProfile.create({
        userId: u._id,
        shopName: `${v.shop} (demo)`,
        slug: `${v.key}-${v.shop.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-demo`,
        businessName: `${v.name} (demo data)`,
        description: 'Demo shop created by the seed script.',
        fssaiLicense: v.lic ? '10020042000001' : undefined,
        drugLicense: v.lic ? 'DEMO-DL-0001' : undefined,
        pickupAddress: { line1: '1 Demo Street', city: v.city, state: v.state, pincode: v.pin },
        payout: { accountHolder: v.name, accountLast4: '0000', ifsc: 'DEMO0000000' },
        delivery: {
          processingDays: v.days,
          shippingChargePaise: v.ship,
          freeShippingAbovePaise: v.free,
          dispatchCutoffHour: 16,
        },
        submittedAt: new Date(),
      });
      report.vendors++;
    }
    vendorUsers[v.key] = u;
  }

  if (await Listing.exists({ vendorId: vendorUsers.v1._id })) {
    report.skipped = true;
    return report;
  }

  const cats = new Map((await Category.find().lean()).map((c) => [c.slug, c]));
  const made = [];
  for (const it of ITEMS) {
    const vendor = vendorUsers[it.v];
    const top = cats.get(it.top);
    const sub = cats.get(it.sub);
    if (!top || !sub)
      throw new Error('Categories are not seeded; run `npm run seed:catalog` first.');
    const asset = await saveUpload({
      buffer: await productImage(it.name, it.top),
      ownerId: vendor._id,
      purpose: 'listing',
    });
    const listing = await createListing(vendor, {
      product: {
        name: it.name,
        brand: { name: it.brand },
        categoryId: String(top._id),
        subcategoryId: String(sub._id),
        description: `${it.name} by ${it.brand}. Demo listing for storefront previews.`,
        ...(it.extra.product ?? {}),
      },
      sku: `DEMO-${made.length + 1}`,
      variant: it.extra.variant,
      pricePaise: it.price * 100,
      mrpPaise: it.mrp * 100,
      stock: it.stock,
      images: [{ key: asset.key, alt: it.name }],
      expiryDate: it.extra.expiryDate,
      prescriptionRequired: it.extra.prescriptionRequired,
    });
    made.push({ listing, sold: it.sold });
    report.listings++;
  }

  // Demo buyers and reviews. Ratings on each listing are computed FROM these rows.
  const buyers = [];
  for (const n of ['Asha Raman', 'Vikram Shah', 'Meera Iyer', 'Rohan Gupta', 'Priya Nair']) {
    const email = `demo.${n.split(' ')[0].toLowerCase()}@vpmart.example`;
    const u =
      (await User.findOne({ email })) ??
      (await User.create({
        name: n,
        email,
        role: 'buyer',
        status: 'active',
        passwordHash,
        passwordChangedAt: new Date(),
      }));
    buyers.push(u);
    report.buyers++;
  }
  const comments = [
    'Good value for the price.',
    'Exactly as described.',
    'Quick delivery and well packed.',
    'Quality is better than expected.',
    'Decent, would buy again.',
  ];
  let k = 0;
  for (const { listing, sold } of made) {
    const n = sold > 150 ? 5 : sold > 70 ? 3 : sold > 40 ? 2 : 0;
    for (let i = 0; i < n; i++) {
      await Review.create({
        listingId: listing._id,
        productId: listing.productId,
        buyerId: buyers[i % buyers.length]._id,
        rating: [5, 4, 5, 4, 3][(k + i) % 5],
        title: 'Demo review',
        body: comments[(k + i) % comments.length],
      });
      report.reviews++;
    }
    k++;
    const [agg] = await Review.aggregate([
      { $match: { listingId: listing._id } },
      { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } },
    ]);
    await Listing.updateOne(
      { _id: listing._id },
      {
        soldCount: sold,
        viewCount: sold * 6,
        ...(agg ? { ratingAvg: Math.round(agg.avg * 10) / 10, ratingCount: agg.n } : {}),
      },
    );
  }

  if (!(await Banner.exists({ title: /\(demo\)$/ }))) {
    const admin = await User.findOne({ role: 'admin' });
    const owner = admin ?? vendorUsers.v1;
    const specs = [
      [
        'Festive Fashion Sale (demo)',
        'Up to 40% off ethnic and casual wear',
        '#d62839',
        '/c/fashion',
        'festival',
        'Shop fashion',
      ],
      [
        'New phones, new prices (demo)',
        'Latest smartphones from trusted sellers',
        '#1b4fd8',
        '/c/electronics',
        'launch',
        'See phones',
      ],
      [
        'Fresh pantry restock (demo)',
        'Groceries and everyday food essentials',
        '#2b8a3e',
        '/c/groceries',
        'banner',
        'Stock up',
      ],
    ];
    let order = 0;
    for (const [title, sub, color, dest, kind, cta] of specs) {
      const a = await saveUpload({
        buffer: await bannerImage(title.replace(' (demo)', ''), sub, color),
        ownerId: owner._id,
        purpose: 'banner',
      });
      const [claimed] = await claimImages([a.key], owner._id, 'banner', { isAdmin: true });
      await Banner.create({
        title,
        description: sub,
        imageKey: claimed.key,
        imageUrl: claimed.url,
        destination: dest,
        kind,
        ctaLabel: cta,
        startAt: new Date(Date.now() - DAY),
        endAt: future(30),
        sortOrder: order++,
        createdBy: owner._id,
      });
      report.banners++;
    }
  }
  await catalogChanged();
  return report;
}

// Required marketplace categories with sensible sub-categories. Admin can edit all of this.
// GST rates are starting points only; confirm them for your products with a tax professional.
// shipping.maxZone limits how far a category can travel (ice cream needs a cold chain).
import { CATEGORY_IMAGES } from '../scripts/seedCategoryImages.js';

const C = (name, slug, extra = {}, subs = []) => ({
  name,
  slug,
  imageUrl: extra.imageUrl || CATEGORY_IMAGES[slug] || null,
  ...extra,
  subs,
});
const S = (name, slug, extra = {}) => ({
  name,
  slug,
  imageUrl: extra.imageUrl || CATEGORY_IMAGES[slug] || null,
  ...extra,
});
// Sub-categories inherit regulation, GST and shipping rules from their parent unless they override them.

export const CATEGORY_SEED = [
  C(
    'Groceries',
    'groceries',
    { regulation: 'food', gstPercent: 5, shipping: { maxZone: 'region', extraDays: 0 } },
    [
      S('Staples & Grains', 'staples-grains'),
      S('Fruits & Vegetables', 'fruits-vegetables', {
        shipping: { maxZone: 'circle', extraDays: 0 },
      }),
      S('Dairy & Eggs', 'dairy-eggs', { shipping: { maxZone: 'local', extraDays: 0 } }),
      S('Snacks', 'snacks'),
      S('Spices & Masalas', 'spices-masalas'),
    ],
  ),
  C('Food & Beverages', 'food-beverages', { regulation: 'food', gstPercent: 12 }, [
    S('Tea & Coffee', 'tea-coffee'),
    S('Soft Drinks & Juices', 'soft-drinks-juices'),
    S('Packaged Foods', 'packaged-foods'),
    S('Sweets & Chocolates', 'sweets-chocolates'),
  ]),
  C(
    'Ice Cream',
    'ice-cream',
    { regulation: 'food', gstPercent: 18, shipping: { maxZone: 'local', extraDays: 0 } },
    [
      S('Cups & Tubs', 'ice-cream-tubs'),
      S('Cones & Bars', 'ice-cream-cones-bars'),
      S('Family Packs', 'ice-cream-family-packs'),
    ],
  ),
  C('Medicines & Healthcare', 'medicines-healthcare', { regulation: 'medicine', gstPercent: 12 }, [
    S('Over-the-Counter', 'otc-medicines'),
    S('Prescription Medicines', 'prescription-medicines'),
    S('Health Devices', 'health-devices', { regulation: 'none', gstPercent: 18 }),
    S('Vitamins & Supplements', 'vitamins-supplements'),
  ]),
  C('Furniture', 'furniture', { gstPercent: 18, shipping: { maxZone: 'national', extraDays: 3 } }, [
    S('Living Room', 'living-room-furniture'),
    S('Bedroom', 'bedroom-furniture'),
    S('Office Furniture', 'office-furniture'),
    S('Storage & Shelves', 'storage-shelves'),
  ]),
  C('Electronics', 'electronics', { gstPercent: 18, deviceFields: true }, [
    S('Mobiles', 'mobiles', { deviceFields: true }),
    S('Laptops & Computers', 'laptops-computers', { deviceFields: true }),
    S('Audio & Headphones', 'audio-headphones', { deviceFields: true }),
    S('Cameras', 'cameras', { deviceFields: true }),
    S('Wearables', 'wearables', { deviceFields: true }),
    S('Accessories', 'electronic-accessories', { deviceFields: true }),
  ]),
  C('Fashion', 'fashion', { gstPercent: 12 }, [
    S("Men's Clothing", 'mens-clothing'),
    S("Women's Clothing", 'womens-clothing'),
    S('Footwear', 'footwear'),
    S('Jewellery & Watches', 'jewellery-watches', { gstPercent: 3 }),
    S('Bags & Accessories', 'bags-accessories'),
  ]),
  C('Home & Kitchen', 'home-kitchen', { gstPercent: 18 }, [
    S('Home Decor', 'home-decor'),
    S('Bedding & Linen', 'bedding-linen', { gstPercent: 12 }),
    S('Storage & Organisation', 'storage-organisation'),
    S('Cleaning Supplies', 'cleaning-supplies'),
  ]),
  C('Vessels and Kitchenware', 'vessels-kitchenware', { gstPercent: 12 }, [
    S('Cookware', 'cookware'),
    S('Dinnerware', 'dinnerware'),
    S('Storage Containers', 'kitchen-containers'),
    S('Kitchen Tools', 'kitchen-tools'),
  ]),
  C('Kids & Baby', 'kids-baby', { gstPercent: 12 }, [
    S('Baby Care', 'baby-care'),
    S('Kids Clothing', 'kids-clothing'),
    S('Baby Gear', 'baby-gear'),
    S('School Essentials', 'school-essentials'),
  ]),
  C('Toys & Games', 'toys-games', { gstPercent: 12 }, [
    S('Action Figures & Dolls', 'figures-dolls'),
    S('Board Games & Puzzles', 'board-games-puzzles'),
    S('Educational Toys', 'educational-toys'),
    S('Outdoor Play', 'outdoor-play'),
  ]),
  C('Books & Stationery', 'books-stationery', { gstPercent: 12 }, [
    S('Books', 'books', { gstPercent: 0 }),
    S('Notebooks & Paper', 'notebooks-paper'),
    S('Writing Supplies', 'writing-supplies'),
    S('Office Supplies', 'office-supplies'),
  ]),
  C('Beauty & Personal Care', 'beauty-personal-care', { gstPercent: 18 }, [
    S('Skincare', 'skincare'),
    S('Haircare', 'haircare'),
    S('Makeup', 'makeup'),
    S('Grooming', 'grooming'),
    S('Fragrances', 'fragrances'),
  ]),
  C('Sports & Fitness', 'sports-fitness', { gstPercent: 18 }, [
    S('Gym & Fitness', 'gym-fitness'),
    S('Cricket', 'cricket'),
    S('Cycling', 'cycling'),
    S('Yoga & Wellness', 'yoga-wellness'),
  ]),
  C(
    'Home Appliances',
    'home-appliances',
    { gstPercent: 18, deviceFields: true, shipping: { maxZone: 'national', extraDays: 1 } },
    [
      S('Kitchen Appliances', 'kitchen-appliances', { deviceFields: true }),
      S('Large Appliances', 'large-appliances', {
        deviceFields: true,
        shipping: { maxZone: 'national', extraDays: 3 },
      }),
      S('Heating & Cooling', 'heating-cooling', { deviceFields: true }),
      S('Cleaning Appliances', 'cleaning-appliances', { deviceFields: true }),
    ],
  ),
  C('Pet Supplies', 'pet-supplies', { gstPercent: 18 }, [
    S('Dog Supplies', 'dog-supplies'),
    S('Cat Supplies', 'cat-supplies'),
    S('Pet Food', 'pet-food', { gstPercent: 5 }),
    S('Aquarium & Small Pets', 'aquarium-small-pets'),
  ]),
  C('Automotive Accessories', 'automotive-accessories', { gstPercent: 28 }, [
    S('Car Accessories', 'car-accessories'),
    S('Bike Accessories', 'bike-accessories'),
    S('Cleaning & Care', 'auto-care'),
    S('Tools & Equipment', 'auto-tools'),
  ]),
  C('Garden & Outdoor', 'garden-outdoor', { gstPercent: 18 }, [
    S('Plants & Seeds', 'plants-seeds', {
      gstPercent: 5,
      shipping: { maxZone: 'circle', extraDays: 0 },
    }),
    S('Planters & Pots', 'planters-pots'),
    S('Garden Tools', 'garden-tools'),
    S('Outdoor Living', 'outdoor-living'),
  ]),
];

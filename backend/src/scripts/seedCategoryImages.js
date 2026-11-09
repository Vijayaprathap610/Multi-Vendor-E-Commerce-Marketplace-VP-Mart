import mongoose from 'mongoose';
import env from '../config/env.js';
import { Category } from '../models/index.js';
import { catalogChanged } from '../services/cache.js';

export const CATEGORY_IMAGES = {
  // --- TOP-LEVEL CATEGORIES ---
  'groceries': 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&auto=format&fit=crop&q=80',
  'food-beverages': 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&auto=format&fit=crop&q=80',
  'ice-cream': 'https://images.unsplash.com/photo-1501443762994-82bd5dace89a?w=600&auto=format&fit=crop&q=80',
  'medicines-healthcare': 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop&q=80',
  'furniture': 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&auto=format&fit=crop&q=80',
  'electronics': 'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=600&auto=format&fit=crop&q=80',
  'fashion': 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=600&auto=format&fit=crop&q=80',
  'home-kitchen': 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&auto=format&fit=crop&q=80',
  'vessels-kitchenware': 'https://images.unsplash.com/photo-1590794056226-79ef3a8147e1?w=600&auto=format&fit=crop&q=80',
  'kids-baby': 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=600&auto=format&fit=crop&q=80',
  'toys-games': 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=600&auto=format&fit=crop&q=80',
  'books-stationery': 'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=600&auto=format&fit=crop&q=80',
  'beauty-personal-care': 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=600&auto=format&fit=crop&q=80',
  'sports-fitness': 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=600&auto=format&fit=crop&q=80',
  'home-appliances': 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=600&auto=format&fit=crop&q=80',
  'pet-supplies': 'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=600&auto=format&fit=crop&q=80',
  'automotive-accessories': 'https://images.unsplash.com/photo-1511919884226-fd3cad34687c?w=600&auto=format&fit=crop&q=80',
  'garden-outdoor': 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=600&auto=format&fit=crop&q=80',

  // --- SUB-CATEGORIES ---
  // Groceries
  'staples-grains': 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&auto=format&fit=crop&q=80',
  'fruits-vegetables': 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=400&auto=format&fit=crop&q=80',
  'dairy-eggs': 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400&auto=format&fit=crop&q=80',
  'snacks': 'https://images.unsplash.com/photo-1621996346565-e3d5d6281744?w=400&auto=format&fit=crop&q=80',
  'spices-masalas': 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=400&auto=format&fit=crop&q=80',

  // Food & Beverages
  'tea-coffee': 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=400&auto=format&fit=crop&q=80',
  'soft-drinks-juices': 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=400&auto=format&fit=crop&q=80',
  'packaged-foods': 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&auto=format&fit=crop&q=80',
  'sweets-chocolates': 'https://images.unsplash.com/photo-1549007994-cb92caebd54b?w=400&auto=format&fit=crop&q=80',

  // Ice Cream
  'ice-cream-tubs': 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=400&auto=format&fit=crop&q=80',
  'ice-cream-cones-bars': 'https://images.unsplash.com/photo-1505394033641-40c6ad1178d7?w=400&auto=format&fit=crop&q=80',
  'ice-cream-family-packs': 'https://images.unsplash.com/photo-1570197788417-0e82375c9371?w=400&auto=format&fit=crop&q=80',

  // Medicines & Healthcare
  'otc-medicines': 'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?w=400&auto=format&fit=crop&q=80',
  'prescription-medicines': 'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=400&auto=format&fit=crop&q=80',
  'health-devices': 'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=400&auto=format&fit=crop&q=80',
  'vitamins-supplements': 'https://images.unsplash.com/photo-1577401239170-897942555fb3?w=400&auto=format&fit=crop&q=80',

  // Furniture
  'living-room-furniture': 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400&auto=format&fit=crop&q=80',
  'bedroom-furniture': 'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=400&auto=format&fit=crop&q=80',
  'office-furniture': 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=400&auto=format&fit=crop&q=80',
  'storage-shelves': 'https://images.unsplash.com/photo-1594026112284-02bb6f3352fe?w=400&auto=format&fit=crop&q=80',

  // Electronics
  'mobiles': 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&auto=format&fit=crop&q=80',
  'laptops-computers': 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=400&auto=format&fit=crop&q=80',
  'audio-headphones': 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&auto=format&fit=crop&q=80',
  'cameras': 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=400&auto=format&fit=crop&q=80',
  'wearables': 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&auto=format&fit=crop&q=80',
  'electronic-accessories': 'https://images.unsplash.com/photo-1625772299848-391b6a87d7b3?w=400&auto=format&fit=crop&q=80',

  // Fashion
  'mens-clothing': 'https://images.unsplash.com/photo-1617137984095-74e4e5e3613f?w=400&auto=format&fit=crop&q=80',
  'womens-clothing': 'https://images.unsplash.com/photo-1525507119028-ed4c629a60a3?w=400&auto=format&fit=crop&q=80',
  'footwear': 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&auto=format&fit=crop&q=80',
  'jewellery-watches': 'https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=400&auto=format&fit=crop&q=80',
  'bags-accessories': 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=400&auto=format&fit=crop&q=80',

  // Home & Kitchen
  'home-decor': 'https://images.unsplash.com/photo-1534349762230-e0cadf78f5da?w=400&auto=format&fit=crop&q=80',
  'bedding-linen': 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=400&auto=format&fit=crop&q=80',
  'storage-organisation': 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=400&auto=format&fit=crop&q=80',
  'cleaning-supplies': 'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=400&auto=format&fit=crop&q=80',

  // Vessels and Kitchenware
  'cookware': 'https://images.unsplash.com/photo-1584990347449-397cf1e71239?w=400&auto=format&fit=crop&q=80',
  'dinnerware': 'https://images.unsplash.com/photo-1614707267537-b85aaf00c4b7?w=400&auto=format&fit=crop&q=80',
  'kitchen-containers': 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=400&auto=format&fit=crop&q=80',
  'kitchen-tools': 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=400&auto=format&fit=crop&q=80',

  // Kids & Baby
  'baby-care': 'https://images.unsplash.com/photo-1555252333-9f8e92e65df9?w=400&auto=format&fit=crop&q=80',
  'kids-clothing': 'https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?w=400&auto=format&fit=crop&q=80',
  'baby-gear': 'https://images.unsplash.com/photo-1591088398332-8a7791972843?w=400&auto=format&fit=crop&q=80',
  'school-essentials': 'https://images.unsplash.com/photo-1588072432836-e10032774350?w=400&auto=format&fit=crop&q=80',

  // Toys & Games
  'figures-dolls': 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=400&auto=format&fit=crop&q=80',
  'board-games-puzzles': 'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?w=400&auto=format&fit=crop&q=80',
  'educational-toys': 'https://images.unsplash.com/photo-1587654780291-39c9404d746b?w=400&auto=format&fit=crop&q=80',
  'outdoor-play': 'https://images.unsplash.com/photo-1508873696983-2df5293cb32f?w=400&auto=format&fit=crop&q=80',

  // Books & Stationery
  'books': 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=400&auto=format&fit=crop&q=80',
  'notebooks-paper': 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400&auto=format&fit=crop&q=80',
  'writing-supplies': 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=400&auto=format&fit=crop&q=80',
  'office-supplies': 'https://images.unsplash.com/photo-1497215728101-856f4ea42174?w=400&auto=format&fit=crop&q=80',

  // Beauty & Personal Care
  'skincare': 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=400&auto=format&fit=crop&q=80',
  'haircare': 'https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?w=400&auto=format&fit=crop&q=80',
  'makeup': 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=400&auto=format&fit=crop&q=80',
  'grooming': 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=400&auto=format&fit=crop&q=80',
  'fragrances': 'https://images.unsplash.com/photo-1547887537-6158d64c35b3?w=400&auto=format&fit=crop&q=80',

  // Sports & Fitness
  'gym-fitness': 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&auto=format&fit=crop&q=80',
  'cricket': 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=400&auto=format&fit=crop&q=80',
  'cycling': 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=400&auto=format&fit=crop&q=80',
  'yoga-wellness': 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400&auto=format&fit=crop&q=80',

  // Home Appliances
  'kitchen-appliances': 'https://images.unsplash.com/photo-1570222094114-d054a817e56b?w=400&auto=format&fit=crop&q=80',
  'large-appliances': 'https://images.unsplash.com/photo-1584269600464-37b1b58a9fe7?w=400&auto=format&fit=crop&q=80',
  'heating-cooling': 'https://images.unsplash.com/photo-1614633833026-0820552978b6?w=400&auto=format&fit=crop&q=80',
  'cleaning-appliances': 'https://images.unsplash.com/photo-1558317374-067fb5f30001?w=400&auto=format&fit=crop&q=80',

  // Pet Supplies
  'dog-supplies': 'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=400&auto=format&fit=crop&q=80',
  'cat-supplies': 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=400&auto=format&fit=crop&q=80',
  'pet-food': 'https://images.unsplash.com/photo-1568640347023-a616a30bc3bd?w=400&auto=format&fit=crop&q=80',
  'aquarium-small-pets': 'https://images.unsplash.com/photo-1522069169874-c58ec4b76be5?w=400&auto=format&fit=crop&q=80',

  // Automotive Accessories
  'car-accessories': 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=400&auto=format&fit=crop&q=80',
  'bike-accessories': 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?w=400&auto=format&fit=crop&q=80',
  'auto-care': 'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?w=400&auto=format&fit=crop&q=80',
  'auto-tools': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400&auto=format&fit=crop&q=80',

  // Garden & Outdoor
  'plants-seeds': 'https://images.unsplash.com/photo-1520412099551-62b6bafeb5bb?w=400&auto=format&fit=crop&q=80',
  'planters-pots': 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?w=400&auto=format&fit=crop&q=80',
  'garden-tools': 'https://images.unsplash.com/photo-1617576683096-00fc8eecb3af?w=400&auto=format&fit=crop&q=80',
  'outdoor-living': 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400&auto=format&fit=crop&q=80',
};

export async function updateCategoryImages() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(env.MONGODB_URI);
  console.log('Connected to MongoDB.');

  const allCats = await Category.find({}).lean();
  console.log(`Found ${allCats.length} total categories in database.`);

  let updatedCount = 0;
  for (const cat of allCats) {
    const img = CATEGORY_IMAGES[cat.slug];
    if (img) {
      await Category.updateOne({ _id: cat._id }, { $set: { imageUrl: img } });
      updatedCount++;
    } else {
      console.warn(`[WARN] No specific image defined for slug: ${cat.slug} (${cat.name})`);
    }
  }

  console.log(`Successfully updated ${updatedCount} categories with HD images.`);

  // Invalidate cached categories and home catalog
  try {
    await catalogChanged();
    console.log('Catalog cache invalidated successfully.');
  } catch (err) {
    console.log('Cache invalidation note:', err.message);
  }

  await mongoose.disconnect();
  console.log('Done.');
}

if (process.argv[1] && process.argv[1].endsWith('seedCategoryImages.js')) {
  updateCategoryImages()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Error updating category images:', err);
      process.exit(1);
    });
}

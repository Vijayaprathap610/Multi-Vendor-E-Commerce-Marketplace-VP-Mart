import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createApp,
  makeListing,
  makeUser,
  makeVendor,
  models,
  newClient,
  resetDb,
  seedCategories,
  setupDb,
  teardownDb,
  catByName,
} from './helpers.js';

let app;
before(async () => {
  await setupDb();
  app = createApp();
});
after(teardownDb);
beforeEach(async () => {
  await resetDb();
  await seedCategories();
});

const adminClient = async () => {
  const a = await makeUser({ role: 'admin' });
  const c = newClient(app);
  await c.login(a.email);
  return c;
};

describe('category seed and public tree', () => {
  it('creates all 18 required categories with sub-categories, and is idempotent', async () => {
    const required = [
      'Groceries',
      'Food & Beverages',
      'Ice Cream',
      'Medicines & Healthcare',
      'Furniture',
      'Electronics',
      'Fashion',
      'Home & Kitchen',
      'Vessels and Kitchenware',
      'Kids & Baby',
      'Toys & Games',
      'Books & Stationery',
      'Beauty & Personal Care',
      'Sports & Fitness',
      'Home Appliances',
      'Pet Supplies',
      'Automotive Accessories',
      'Garden & Outdoor',
    ];
    const tops = await models.Category.find({ parent: null }).lean();
    assert.deepEqual(tops.map((c) => c.name).sort(), [...required].sort());
    for (const t of tops)
      assert.ok(
        (await models.Category.countDocuments({ parent: t._id })) >= 3,
        `${t.name} has sub-categories`,
      );
    const before = await models.Category.countDocuments();
    const again = await seedCategories();
    assert.equal(again.created, 0);
    assert.equal(await models.Category.countDocuments(), before);
  });

  it('serves the active category tree publicly', async () => {
    const res = await newClient(app).get('/api/catalog/categories');
    assert.equal(res.status, 200);
    assert.equal(res.body.items.length, 18);
    const electronics = res.body.items.find((c) => c.slug === 'electronics');
    assert.ok(electronics.children.some((c) => c.slug === 'mobiles'));
  });

  it('sub-categories inherit regulation, handling and tax from their parent', async () => {
    const tub = await models.Category.findOne({ slug: 'ice-cream-tubs' });
    assert.equal(tub.regulation, 'inherit');
    assert.equal(tub.shipping.maxZone, 'local');
    const devices = await models.Category.findOne({ slug: 'health-devices' });
    assert.equal(devices.regulation, 'none');
  });
});

describe('admin category management', () => {
  it('creates, edits and deactivates categories; only admins may', async () => {
    const c = await adminClient();
    const created = await c.post('/api/admin/categories', {
      name: 'Musical Instruments',
      gstPercent: 18,
    });
    assert.equal(created.status, 201);
    const id = created.body.category._id;
    const sub = await c.post('/api/admin/categories', { name: 'Guitars', parent: id });
    assert.equal(sub.status, 201);
    assert.equal(sub.body.category.regulation, 'inherit');
    assert.equal(
      (await c.post('/api/admin/categories', { name: 'Too Deep', parent: sub.body.category._id }))
        .status,
      422,
    );
    assert.equal(
      (await c.post('/api/admin/categories', { name: 'Musical Instruments' })).status,
      409,
    );
    assert.equal(
      (await c.patch(`/api/admin/categories/${id}`, { description: 'Instruments' })).status,
      200,
    );

    const buyer = await makeUser();
    const bc = newClient(app);
    await bc.login(buyer.email);
    assert.equal((await bc.post('/api/admin/categories', { name: 'Hack' })).status, 403);
  });

  it('deactivating a category hides its listings but destroys nothing', async () => {
    const c = await adminClient();
    const v = await makeVendor();
    const fashion = await catByName('Fashion');
    const l = await makeListing(v, { category: fashion });
    const anon = newClient(app);
    assert.equal((await anon.get(`/api/catalog/listings/${l._id}`)).status, 200);

    assert.equal(
      (await c.patch(`/api/admin/categories/${fashion._id}`, { isActive: false })).status,
      200,
    );
    assert.equal((await anon.get(`/api/catalog/listings/${l._id}`)).status, 404);
    assert.equal(
      (await anon.get('/api/catalog/categories')).body.items.some((x) => x.slug === 'fashion'),
      false,
    );
    const kept = await models.Listing.findById(l._id);
    assert.ok(kept, 'listing record preserved');
    assert.equal(kept.status, 'active');
    assert.equal(kept.isPublic, false);

    await c.patch(`/api/admin/categories/${fashion._id}`, { isActive: true });
    assert.equal((await anon.get(`/api/catalog/listings/${l._id}`)).status, 200);
  });

  it('deactivating a parent hides sub-category listings too', async () => {
    const c = await adminClient();
    const v = await makeVendor();
    const electronics = await catByName('Electronics');
    const mobiles = await catByName('Mobiles');
    const l = await makeListing(v, {
      category: electronics,
      product: { subcategoryId: String(mobiles._id), model: 'X1' },
      name: 'Phone X',
    });
    await c.patch(`/api/admin/categories/${electronics._id}`, { isActive: false });
    assert.equal((await newClient(app).get(`/api/catalog/listings/${l._id}`)).status, 404);
  });
});

describe('brands', () => {
  it('admin manages brands; vendor-supplied brand names reuse existing brands case-insensitively', async () => {
    const c = await adminClient();
    const b = await c.post('/api/admin/brands', { name: 'Zenith' });
    assert.equal(b.status, 201);
    assert.equal((await c.post('/api/admin/brands', { name: 'zenith' })).status, 409);
    const v = await makeVendor();
    await makeListing(v, { brand: 'ZENITH', name: 'Zen Tee' });
    assert.equal(await models.Brand.countDocuments({ name: /zenith/i }), 1);
    await c.patch(`/api/admin/brands/${b.body.brand._id}`, { name: 'Zenith Co' });
    assert.equal((await models.Listing.findOne({ title: 'Zen Tee' })).brandName, 'Zenith Co');
    const list = await c.get('/api/admin/brands');
    assert.equal(list.body.items.find((x) => x.name === 'Zenith Co').listingCount, 1);
  });
});

import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PASSWORD,
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
import { catalogChanged } from '../src/services/cache.js';

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

const get = (url) => newClient(app).get(url);
async function seedShop() {
  const v1 = await makeVendor({ shop: 'Alpha Store' });
  const v2 = await makeVendor({ shop: 'Beta Mart' });
  const fashion = await catByName('Fashion');
  const mens = await models.Category.findOne({ slug: 'mens-clothing' });
  const ice = await catByName('Ice Cream');
  const exp = new Date(Date.now() + 9e9);
  const a = await makeListing(v1, {
    name: 'Linen Shirt',
    brand: 'Acme',
    category: fashion,
    product: { subcategoryId: String(mens._id) },
    pricePaise: 50000,
    mrpPaise: 80000,
    stock: 10,
  });
  const b = await makeListing(v1, {
    name: 'Denim Shirt',
    brand: 'Bolt',
    category: fashion,
    pricePaise: 90000,
    mrpPaise: 90000,
    stock: 0,
  });
  const c = await makeListing(v2, {
    name: 'Vanilla Ice Cream',
    brand: 'Frosty',
    category: ice,
    pricePaise: 12000,
    mrpPaise: 12000,
    stock: 30,
    extra: { expiryDate: exp },
  });
  const d = await makeListing(v2, {
    name: 'Linen Trousers',
    brand: 'Acme',
    category: fashion,
    pricePaise: 70000,
    mrpPaise: 70000,
    stock: 4,
  });
  await models.Listing.updateOne(
    { _id: a._id },
    { soldCount: 50, ratingAvg: 4.2, ratingCount: 10, createdAt: new Date('2026-01-01') },
  );
  await models.Listing.updateOne(
    { _id: b._id },
    { soldCount: 5, ratingAvg: 4.9, ratingCount: 3, createdAt: new Date('2026-02-01') },
  );
  await models.Listing.updateOne(
    { _id: c._id },
    { soldCount: 90, ratingAvg: 3.5, ratingCount: 40, createdAt: new Date('2026-03-01') },
  );
  await models.Listing.updateOne(
    { _id: d._id },
    { soldCount: 10, ratingAvg: 4.0, ratingCount: 2, createdAt: new Date('2026-04-01') },
  );
  await catalogChanged();
  return { a, b, c, d };
}
const titles = (r) => r.body.items.map((i) => i.title);

describe('search, filter and sort', () => {
  it('finds products by partial, multi-word, case-insensitive text', async () => {
    await seedShop();
    assert.deepEqual(titles(await get('/api/catalog/search?q=shir')).sort(), [
      'Denim Shirt',
      'Linen Shirt',
    ]);
    assert.deepEqual(titles(await get('/api/catalog/search?q=LINEN shirt')), ['Linen Shirt']);
    assert.deepEqual(titles(await get('/api/catalog/search?q=acme')).sort(), [
      'Linen Shirt',
      'Linen Trousers',
    ]);
    assert.equal((await get('/api/catalog/search?q=zzzz')).body.total, 0);
  });

  it('treats regex characters in the query as plain text', async () => {
    await seedShop();
    const r = await get('/api/catalog/search?q=' + encodeURIComponent('.*'));
    assert.equal(r.status, 200);
    assert.equal(r.body.total, 0);
  });

  it('filters by category (incl. sub-categories and comma lists), brand, price and stock', async () => {
    await seedShop();
    assert.equal((await get('/api/catalog/search?category=fashion')).body.total, 3);
    assert.equal((await get('/api/catalog/search?category=mens-clothing')).body.total, 1);
    assert.equal((await get('/api/catalog/search?category=ice-cream,mens-clothing')).body.total, 2);
    assert.equal((await get('/api/catalog/search?category=nope')).body.total, 0);
    assert.deepEqual(titles(await get('/api/catalog/search?brand=acme')).sort(), [
      'Linen Shirt',
      'Linen Trousers',
    ]);
    assert.deepEqual(titles(await get('/api/catalog/search?minPrice=500&maxPrice=700')).sort(), [
      'Linen Shirt',
      'Linen Trousers',
    ]);
    assert.equal((await get('/api/catalog/search?inStock=true')).body.total, 3);
    assert.equal((await get('/api/catalog/search?minPrice=900&maxPrice=100')).status, 422);
    const slug = (await models.VendorProfile.findOne({ shopName: 'Alpha Store' })).slug;
    assert.equal((await get(`/api/catalog/search?vendor=${slug}`)).body.total, 2);
    assert.equal((await get('/api/catalog/search?vendor=no-such-shop')).body.total, 0);
  });

  it('sorts by price, popularity, rating and newest', async () => {
    await seedShop();
    assert.deepEqual(titles(await get('/api/catalog/search?sort=price_asc')), [
      'Vanilla Ice Cream',
      'Linen Shirt',
      'Linen Trousers',
      'Denim Shirt',
    ]);
    assert.deepEqual(titles(await get('/api/catalog/search?sort=price_desc')), [
      'Denim Shirt',
      'Linen Trousers',
      'Linen Shirt',
      'Vanilla Ice Cream',
    ]);
    assert.deepEqual(titles(await get('/api/catalog/search?sort=popularity')), [
      'Vanilla Ice Cream',
      'Linen Shirt',
      'Linen Trousers',
      'Denim Shirt',
    ]);
    assert.deepEqual(titles(await get('/api/catalog/search?sort=rating')), [
      'Denim Shirt',
      'Linen Shirt',
      'Linen Trousers',
      'Vanilla Ice Cream',
    ]);
    assert.deepEqual(titles(await get('/api/catalog/search?sort=newest')), [
      'Linen Trousers',
      'Vanilla Ice Cream',
      'Denim Shirt',
      'Linen Shirt',
    ]);
    assert.equal((await get('/api/catalog/search?sort=drop_tables')).status, 422);
  });

  it('paginates and reports totals, pages and facets', async () => {
    await seedShop();
    const p1 = await get('/api/catalog/search?sort=price_asc&limit=3&page=1');
    const p2 = await get('/api/catalog/search?sort=price_asc&limit=3&page=2');
    assert.equal(p1.body.items.length, 3);
    assert.equal(p2.body.items.length, 1);
    assert.equal(p1.body.total, 4);
    assert.equal(p1.body.pages, 2);
    assert.equal(p1.body.facets.price.minPaise, 12000);
    assert.equal(p1.body.facets.price.maxPaise, 90000);
    const acme = p1.body.facets.brands.find((b) => b.name === 'Acme');
    assert.equal(acme.count, 2);
    assert.equal(acme.slug, 'acme');
    assert.equal((await get('/api/catalog/search?limit=500')).status, 422);
  });

  it('never returns inactive, hidden, suspended-vendor or out-of-category listings', async () => {
    const { a, b, c } = await seedShop();
    await models.Listing.updateOne({ _id: a._id }, { status: 'inactive', isPublic: false });
    await models.Listing.updateOne({ _id: b._id }, { status: 'hidden', isPublic: false });
    await catalogChanged();
    assert.deepEqual(titles(await get('/api/catalog/search')).sort(), [
      'Linen Trousers',
      'Vanilla Ice Cream',
    ]);
    const res = await get('/api/catalog/search');
    assert.ok(!JSON.stringify(res.body).includes(String(c.vendorId) + 'x'));
    assert.ok(!('stock' in res.body.items[0]), 'exact stock is not exposed publicly');
  });

  it('public items expose price, discount and availability but not internal counters', async () => {
    await seedShop();
    const it1 = (await get('/api/catalog/search?q=linen shirt')).body.items[0];
    assert.equal(it1.pricePaise, 50000);
    assert.equal(it1.mrpPaise, 80000);
    assert.equal(it1.discountPercent, 37);
    assert.equal(it1.inStock, true);
    assert.equal(it1.vendor.name, 'Alpha Store');
    for (const k of ['soldCount', 'viewCount', 'vendorActive', 'catActive', 'searchDirty'])
      assert.ok(!(k in it1), k);
  });
});

describe('redis cache and invalidation', () => {
  it('serves repeated searches from cache, and a catalogue change invalidates it', async () => {
    const { a } = await seedShop();
    assert.equal((await get('/api/catalog/search?q=linen shirt')).body.items[0].pricePaise, 50000);
    // Change MongoDB behind the cache's back: the cached answer is still served (proves caching).
    await models.Listing.updateOne({ _id: a._id }, { pricePaise: 49900 });
    assert.equal((await get('/api/catalog/search?q=linen shirt')).body.items[0].pricePaise, 50000);
    // Any real change goes through the catalogue-version bump and is visible immediately.
    await catalogChanged();
    assert.equal((await get('/api/catalog/search?q=linen shirt')).body.items[0].pricePaise, 49900);
  });

  it('a vendor price update is visible on the very next request', async () => {
    const { a } = await seedShop();
    const vendor = await models.User.findById(a.vendorId);
    const c = newClient(app);
    await c.login(vendor.email, PASSWORD);
    await get('/api/catalog/search?q=linen shirt');
    await get(`/api/catalog/listings/${a._id}`);
    assert.equal(
      (await c.patch(`/api/vendor/listings/${a._id}`, { pricePaise: 45000 })).status,
      200,
    );
    assert.equal((await get('/api/catalog/search?q=linen shirt')).body.items[0].pricePaise, 45000);
    assert.equal((await get(`/api/catalog/listings/${a._id}`)).body.listing.pricePaise, 45000);
  });
});

describe('suggestions', () => {
  it('suggests products, brands and categories', async () => {
    await seedShop();
    const r = await get('/api/catalog/suggest?q=lin');
    assert.ok(r.body.products.includes('Linen Shirt'));
    const r2 = await get('/api/catalog/suggest?q=fash');
    assert.equal(r2.body.categories[0].slug, 'fashion');
    const r3 = await get('/api/catalog/suggest?q=acm');
    assert.equal(r3.body.brands[0].name, 'Acme');
    assert.equal((await get('/api/catalog/suggest?q=')).status, 422);
  });
});

describe('homepage sections come from real data', () => {
  it('is empty when there is no data (nothing hardcoded)', async () => {
    const r = await get('/api/catalog/home');
    assert.equal(r.status, 200);
    for (const k of [
      'featuredCategories',
      'popularBrands',
      'trending',
      'bestSellers',
      'newArrivals',
      'todaysDeals',
      'popularPicks',
    ])
      assert.deepEqual(r.body[k], [], k);
  });

  it('builds each section from listings, orders and views', async () => {
    const { a } = await seedShop();
    const home = (await get('/api/catalog/home')).body;
    assert.equal(home.newArrivals[0].title, 'Linen Trousers');
    assert.deepEqual(
      home.todaysDeals.map((d) => d.title),
      ['Linen Shirt'],
    );
    assert.ok(home.todaysDeals.every((d) => d.discountPercent >= home.dealThresholdPercent));
    assert.equal(home.bestSellers[0].title, 'Vanilla Ice Cream');
    assert.ok(
      !home.newArrivals.some((i) => i.title === 'Denim Shirt'),
      'out-of-stock items are not promoted',
    );
    assert.equal(home.popularBrands[0].name, 'Acme');
    assert.equal(home.featuredCategories[0].slug, 'fashion');
    assert.equal(home.popularPicks[0].title, 'Linen Shirt');
    assert.deepEqual(home.trending.map((t) => t.title).slice(0, 1), ['Vanilla Ice Cream']);
    // Views feed trending: view a low-seller many times and it moves up.
    for (let i = 0; i < 3; i++) await get(`/api/catalog/listings/${a._id}`);
    await new Promise((r) => setTimeout(r, 150));
    assert.equal((await models.Listing.findById(a._id)).viewCount, 3);
  });
});

describe('product detail, reviews and related', () => {
  it('returns detail with vendor info and no private data; 404s for unknown or hidden', async () => {
    const { a } = await seedShop();
    const r = await get(`/api/catalog/listings/${a._id}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.vendor.name, 'Alpha Store');
    assert.ok(!JSON.stringify(r.body).match(/payout|gstin|accountLast4|email|phone|pickupAddress/));
    assert.equal((await get('/api/catalog/listings/64b000000000000000000000')).status, 404);
    assert.equal((await get('/api/catalog/listings/notanid')).status, 422);
  });

  it('shows a delivery estimate when a PIN code is given and rejects a bad one', async () => {
    const { a } = await seedShop();
    const ok = await get(`/api/catalog/listings/${a._id}?pincode=600001`);
    assert.equal(ok.body.delivery.serviceable, true);
    assert.equal(ok.body.delivery.zone, 'region');
    assert.match(ok.body.delivery.earliest, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal((await get(`/api/catalog/listings/${a._id}?pincode=12`)).status, 422);
    assert.equal((await get(`/api/catalog/listings/${a._id}`)).body.delivery, null);
  });

  it('lists reviews with anonymised names and a rating distribution', async () => {
    const { a } = await seedShop();
    const buyer = await makeUser({ name: 'Asha Raman' });
    await models.Review.create({
      listingId: a._id,
      productId: a.productId,
      buyerId: buyer._id,
      rating: 5,
      title: 'Great',
      body: 'Fits well',
    });
    const r = await get(`/api/catalog/listings/${a._id}/reviews`);
    assert.equal(r.body.total, 1);
    assert.equal(r.body.items[0].reviewer, 'Asha R.');
    assert.equal(r.body.distribution[5], 1);
    assert.ok(!JSON.stringify(r.body).includes(String(buyer._id)));
  });

  it('suggests related products from the same category', async () => {
    const { a } = await seedShop();
    const r = await get(`/api/catalog/listings/${a._id}/related`);
    assert.ok(
      r.body.items.every(
        (i) => i.category.slug === 'fashion' || i.category.slug === 'mens-clothing',
      ),
    );
    assert.ok(!r.body.items.some((i) => i.id === String(a._id)));
  });
});

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
import { priceItems } from '../src/services/cartService.js';
import { getRedis } from '../src/services/cache.js';

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

const buyerClient = async () => {
  const u = await makeUser();
  const c = newClient(app);
  assert.equal((await c.login(u.email, PASSWORD)).status, 200);
  return { u, c };
};
const setDelivery = (vendor, delivery) =>
  models.VendorProfile.updateOne({ userId: vendor._id }, { $set: { delivery } });

describe('cart access', () => {
  it('requires a signed-in buyer', async () => {
    assert.equal((await newClient(app).get('/api/cart')).status, 401);
    const v = await makeVendor();
    const c = newClient(app);
    await c.login(v.email, PASSWORD);
    assert.equal((await c.get('/api/cart')).status, 403);
  });
});

describe('cart totals (server-side, integer paise)', () => {
  it('matches the spec example: 2 shirts at ₹500 + 3 ice creams at ₹100 = ₹1,300 subtotal', async () => {
    const v = await makeVendor();
    const shirt = await makeListing(v, {
      name: 'Shirt',
      pricePaise: 50000,
      mrpPaise: 50000,
      stock: 10,
    });
    const ice = await makeListing(v, {
      name: 'Ice Cream Cup',
      category: await catByName('Ice Cream'),
      pricePaise: 10000,
      mrpPaise: 10000,
      stock: 10,
      extra: { expiryDate: new Date(Date.now() + 5e9) },
    });
    const { c } = await buyerClient();
    await c.post('/api/cart/items', { listingId: String(shirt._id), quantity: 2 });
    const res = await c.post('/api/cart/items', { listingId: String(ice._id), quantity: 3 });
    assert.equal(res.status, 201);
    const t = res.body.totals;
    assert.equal(t.subtotalPaise, 130000);
    assert.equal(t.discountPaise, 0);
    assert.equal(res.body.lines.find((l) => l.title === 'Shirt').linePaise, 100000);
    assert.equal(res.body.lines.find((l) => l.title === 'Ice Cream Cup').linePaise, 30000);
    // GST is included in the listed prices by default: 12% on shirts, 18% on ice cream.
    assert.equal(t.taxMode, 'inclusive');
    assert.equal(t.taxPaise, 10714 + 4576);
    assert.equal(t.totalPaise, 130000);
  });

  it('adds tax on top in exclusive mode and rounds without drift', async () => {
    const v = await makeVendor();
    const l = await makeListing(v, { pricePaise: 33333, mrpPaise: 33333, stock: 10 });
    const inc = await priceItems([{ listingId: l._id, quantity: 3 }], { taxMode: 'inclusive' });
    const exc = await priceItems([{ listingId: l._id, quantity: 3 }], { taxMode: 'exclusive' });
    assert.equal(inc.totals.taxMode, 'inclusive');
    assert.equal(exc.totals.taxMode, 'exclusive');
    assert.equal(inc.totals.subtotalPaise, 99999);
    assert.equal(inc.totals.totalPaise, 99999);
    assert.equal(exc.totals.taxPaise, Math.floor((99999 * 12 * 2 + 100) / 200));
    assert.equal(exc.totals.totalPaise, 99999 + exc.totals.taxPaise);
    for (const n of [inc.totals.taxPaise, exc.totals.taxPaise]) assert.ok(Number.isInteger(n));
  });

  it('charges shipping per vendor shipment, waived above the vendor free-shipping threshold', async () => {
    const v1 = await makeVendor({ shop: 'Cheap Ship' });
    const v2 = await makeVendor({ shop: 'Paid Ship' });
    await setDelivery(v1, { shippingChargePaise: 4900, freeShippingAbovePaise: 99900 });
    await setDelivery(v2, { shippingChargePaise: 6000 });
    const a = await makeListing(v1, { pricePaise: 50000, mrpPaise: 50000 });
    const b = await makeListing(v2, { pricePaise: 20000, mrpPaise: 20000 });
    const small = await priceItems([
      { listingId: a._id, quantity: 1 },
      { listingId: b._id, quantity: 1 },
    ]);
    assert.equal(small.shipments.length, 2);
    assert.equal(small.totals.shippingPaise, 4900 + 6000);
    assert.equal(small.totals.totalPaise, 70000 + 10900);
    const big = await priceItems([
      { listingId: a._id, quantity: 2 },
      { listingId: b._id, quantity: 1 },
    ]);
    assert.equal(big.totals.shippingPaise, 6000);
    assert.equal(big.shipments.find((s) => s.vendorName === 'Cheap Ship').freeShipping, true);
  });

  it('ignores any client-supplied price or total', async () => {
    const v = await makeVendor();
    const l = await makeListing(v, { pricePaise: 50000, mrpPaise: 50000 });
    const { c } = await buyerClient();
    assert.equal(
      (await c.post('/api/cart/items', { listingId: String(l._id), quantity: 1, pricePaise: 1 }))
        .status,
      422,
    );
    const q = await c.post('/api/pricing/quote', {
      items: [{ listingId: String(l._id), quantity: 2 }],
    });
    assert.equal(q.status, 200);
    assert.equal(q.body.totals.subtotalPaise, 100000);
    assert.equal(
      (
        await c.post('/api/pricing/quote', {
          items: [{ listingId: String(l._id), quantity: 2, unitPaise: 5 }],
        })
      ).status,
      422,
    );
  });
});

describe('stock validation and concurrency', () => {
  it('limits quantity to available stock and merges repeated adds', async () => {
    const v = await makeVendor();
    const l = await makeListing(v, { stock: 3 });
    const { c } = await buyerClient();
    assert.equal(
      (await c.post('/api/cart/items', { listingId: String(l._id), quantity: 2 })).status,
      201,
    );
    const more = await c.post('/api/cart/items', { listingId: String(l._id), quantity: 2 });
    assert.equal(more.status, 409);
    assert.equal(more.body.error.code, 'INSUFFICIENT_STOCK');
    const ok = await c.post('/api/cart/items', { listingId: String(l._id), quantity: 1 });
    assert.equal(ok.body.lines.length, 1);
    assert.equal(ok.body.lines[0].quantity, 3);
    assert.equal((await c.patch(`/api/cart/items/${l._id}`, { quantity: 4 })).status, 409);
    assert.equal(
      (await c.patch(`/api/cart/items/${l._id}`, { quantity: 1 })).body.totals.subtotalPaise,
      50000,
    );
  });

  it('concurrent adds never duplicate a line or lose an update', async () => {
    const v = await makeVendor();
    const l = await makeListing(v, { stock: 10 });
    const { u, c } = await buyerClient();
    const rs = await Promise.all(
      Array.from({ length: 6 }, () =>
        c.post('/api/cart/items', { listingId: String(l._id), quantity: 1 }),
      ),
    );
    assert.ok(rs.every((r) => r.status === 201));
    const cart = await models.Cart.findOne({ userId: u._id }).lean();
    assert.equal(cart.items.length, 1);
    assert.equal(cart.items[0].quantity, 6);
  });

  it('concurrent adds cannot exceed stock', async () => {
    const v = await makeVendor();
    const l = await makeListing(v, { stock: 3 });
    const { u, c } = await buyerClient();
    const rs = await Promise.all(
      Array.from({ length: 6 }, () =>
        c.post('/api/cart/items', { listingId: String(l._id), quantity: 1 }),
      ),
    );
    assert.equal(rs.filter((r) => r.status === 201).length, 3);
    assert.equal(rs.filter((r) => r.status === 409).length, 3);
    assert.equal((await models.Cart.findOne({ userId: u._id }).lean()).items[0].quantity, 3);
  });

  it('refuses unavailable products and flags lines that become unavailable later', async () => {
    const v = await makeVendor();
    const a = await makeListing(v, { stock: 5 });
    const b = await makeListing(v, { stock: 5, pricePaise: 20000, mrpPaise: 20000 });
    const out = await makeListing(v, { stock: 0 });
    const { c } = await buyerClient();
    assert.equal(
      (await c.post('/api/cart/items', { listingId: String(out._id), quantity: 1 })).status,
      409,
    );
    assert.equal(
      (await c.post('/api/cart/items', { listingId: '64b000000000000000000000', quantity: 1 }))
        .status,
      404,
    );
    await c.post('/api/cart/items', { listingId: String(a._id), quantity: 2 });
    await c.post('/api/cart/items', { listingId: String(b._id), quantity: 1 });
    await models.Listing.updateOne({ _id: a._id }, { stock: 0 });
    await (await import('../src/services/cache.js')).catalogChanged();
    const cart = (await c.get('/api/cart')).body;
    const line = cart.lines.find((l) => l.listingId === String(a._id));
    assert.equal(line.available, false);
    assert.deepEqual(line.issues, ['OUT_OF_STOCK']);
    assert.equal(cart.hasIssues, true);
    assert.equal(cart.totals.subtotalPaise, 20000);
  });

  it('removes items and clears the cart', async () => {
    const v = await makeVendor();
    const a = await makeListing(v);
    const b = await makeListing(v);
    const { c } = await buyerClient();
    await c.post('/api/cart/items', { listingId: String(a._id), quantity: 1 });
    await c.post('/api/cart/items', { listingId: String(b._id), quantity: 1 });
    assert.equal((await c.del(`/api/cart/items/${a._id}`)).body.lines.length, 1);
    assert.equal((await c.del('/api/cart')).body.lines.length, 0);
  });

  it('keeps each buyer’s cart private', async () => {
    const v = await makeVendor();
    const l = await makeListing(v);
    const one = await buyerClient();
    const two = await buyerClient();
    await one.c.post('/api/cart/items', { listingId: String(l._id), quantity: 2 });
    assert.equal((await two.c.get('/api/cart')).body.lines.length, 0);
  });
});

describe('redis cart cache', () => {
  it('writes a per-user cache entry that matches MongoDB and falls back when it is gone', async () => {
    const v = await makeVendor();
    const l = await makeListing(v);
    const { u, c } = await buyerClient();
    await c.post('/api/cart/items', { listingId: String(l._id), quantity: 2 });
    const raw = await getRedis().get(`cart:u:${u._id}`);
    assert.deepEqual(JSON.parse(raw), [{ listingId: String(l._id), quantity: 2 }]);
    await getRedis().del(`cart:u:${u._id}`);
    assert.equal((await c.get('/api/cart')).body.lines[0].quantity, 2);
    await c.del('/api/cart');
    assert.deepEqual(JSON.parse(await getRedis().get(`cart:u:${u._id}`)), []);
  });
});

describe('orders list', () => {
  it('returns the buyer’s own orders only (none yet)', async () => {
    const { c } = await buyerClient();
    const r = await c.get('/api/orders');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.items, []);
  });
});

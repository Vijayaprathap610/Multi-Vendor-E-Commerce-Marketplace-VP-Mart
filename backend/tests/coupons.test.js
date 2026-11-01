import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PASSWORD,
  catByName,
  createApp,
  makeAddress,
  makeListing,
  makeUser,
  makeVendor,
  models,
  newClient,
  resetDb,
  seedCategories,
  setupDb,
  teardownDb,
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

const day = 86400000;
const asAdmin = async () => {
  const u = await makeUser({ role: 'admin' });
  const c = newClient(app);
  await c.login(u.email, PASSWORD);
  return c;
};
const asBuyer = async (over = {}) => {
  const u = await makeUser(over);
  const c = newClient(app);
  await c.login(u.email, PASSWORD);
  return { u, c };
};
const body = (over = {}) => ({
  discountType: 'fixed',
  value: 10000,
  validFrom: new Date(Date.now() - day).toISOString(),
  validTo: new Date(Date.now() + 5 * day).toISOString(),
  appliesToAll: true,
  ...over,
});

async function shop() {
  const v = await makeVendor({ shop: 'Coupon Shop' });
  const shirt = await makeListing(v, {
    name: 'Linen Shirt',
    pricePaise: 50000,
    mrpPaise: 50000,
    stock: 20,
  });
  const ice = await makeListing(v, {
    name: 'Vanilla Ice Cream',
    category: await catByName('Ice Cream'),
    pricePaise: 10000,
    mrpPaise: 10000,
    stock: 20,
    extra: { expiryDate: new Date(Date.now() + 9e9) },
  });
  return { v, shirt, ice };
}
const addToCart = (c, l, q = 1) =>
  c.post('/api/cart/items', { listingId: String(l._id), quantity: q });

describe('admin coupon management', () => {
  it('creates coupons with unique server-generated codes; only admins may', async () => {
    const { shirt } = await shop();
    const admin = await asAdmin();
    const a = await admin.post(
      `/api/admin/products/${shirt.productId}/coupons`,
      body({ appliesToAll: false, discountType: 'percent', value: 60 }),
    );
    assert.equal(a.status, 201);
    assert.match(a.body.coupon.code, /^LINEN60[0-9A-F]{4}$/);
    assert.deepEqual(
      a.body.coupon.products.map((p) => p.name),
      ['Linen Shirt'],
    );
    const b = await admin.post(
      `/api/admin/products/${shirt.productId}/coupons`,
      body({ appliesToAll: false, discountType: 'percent', value: 60 }),
    );
    assert.notEqual(a.body.coupon.code, b.body.coupon.code);
    assert.equal(await models.Coupon.countDocuments(), 2);
    const { c: buyer } = await asBuyer();
    assert.equal((await buyer.post('/api/admin/coupons', body())).status, 403);
    assert.equal((await newClient(app).get('/api/admin/coupons')).status, 401);
  });

  it('validates discount rules, dates, targets and unknown products', async () => {
    const { shirt } = await shop();
    const admin = await asAdmin();
    const bad = async (over) => (await admin.post('/api/admin/coupons', body(over))).status;
    assert.equal(await bad({ discountType: 'percent', value: 150 }), 422);
    assert.equal(await bad({ discountType: 'fixed', maxDiscountPaise: 500 }), 422);
    assert.equal(await bad({ validTo: new Date(Date.now() - 2 * day).toISOString() }), 422);
    assert.equal(await bad({ appliesToAll: false, productIds: [] }), 422);
    assert.equal(await bad({ appliesToAll: true, productIds: [String(shirt.productId)] }), 422);
    assert.equal(await bad({ appliesToAll: false, productIds: ['64b000000000000000000000'] }), 422);
    assert.equal(await bad({ eligibility: { mode: 'buyers', buyerIds: [] } }), 422);
    assert.equal(await bad({ code: 'HACK' }), 422);
    assert.equal(
      await bad({ eligibility: { mode: 'buyers', buyerIds: ['64b000000000000000000000'] } }),
      422,
    );
  });

  it('lists coupons with usage figures and filters by status', async () => {
    const admin = await asAdmin();
    await admin.post('/api/admin/coupons', body({ title: 'Live' }));
    await admin.post(
      '/api/admin/coupons',
      body({
        title: 'Later',
        validFrom: new Date(Date.now() + 3 * day).toISOString(),
        validTo: new Date(Date.now() + 9 * day).toISOString(),
      }),
    );
    await admin.post('/api/admin/coupons', body({ title: 'Off', isActive: false }));
    const all = await admin.get('/api/admin/coupons');
    assert.equal(all.body.total, 3);
    assert.equal((await admin.get('/api/admin/coupons?status=active')).body.items[0].title, 'Live');
    assert.equal(
      (await admin.get('/api/admin/coupons?status=scheduled')).body.items[0].title,
      'Later',
    );
    assert.equal(
      (await admin.get('/api/admin/coupons?status=inactive')).body.items[0].title,
      'Off',
    );
    assert.equal(all.body.items[0].usedCount, 0);
  });

  it('edits coupons safely: no value change after use, no limit below usage', async () => {
    const admin = await asAdmin();
    const {
      body: { coupon },
    } = await admin.post('/api/admin/coupons', body({ usageLimit: 5 }));
    assert.equal(
      (await admin.patch(`/api/admin/coupons/${coupon.id}`, { value: 20000, isPublic: true }))
        .status,
      200,
    );
    await models.Coupon.updateOne({ _id: coupon.id }, { usedCount: 2 });
    assert.equal(
      (await admin.patch(`/api/admin/coupons/${coupon.id}`, { value: 30000 })).body.error.code,
      'COUPON_IN_USE',
    );
    assert.equal(
      (await admin.patch(`/api/admin/coupons/${coupon.id}`, { usageLimit: 1 })).status,
      422,
    );
    assert.equal(
      (await admin.patch(`/api/admin/coupons/${coupon.id}`, { usageLimit: 3, isActive: false }))
        .status,
      200,
    );
    assert.equal(
      (await admin.patch(`/api/admin/coupons/${coupon.id}`, { code: 'NEWCODE' })).status,
      422,
      'the code is immutable',
    );
    assert.equal(
      (
        await admin.patch(`/api/admin/coupons/${coupon.id}`, {
          validTo: new Date(Date.now() - 9 * day).toISOString(),
        })
      ).status,
      422,
    );
  });
});

describe('coupon eligibility and amounts (server-side)', () => {
  const makeCoupon = async (over) =>
    (await asAdmin()).post('/api/admin/coupons', body(over)).then((r) => r.body.coupon);

  it('SHIRT60 applies to shirts only, never to ice cream unless explicitly included', async () => {
    const { shirt, ice } = await shop();
    const admin = await asAdmin();
    const {
      body: { coupon },
    } = await admin.post(
      `/api/admin/products/${shirt.productId}/coupons`,
      body({ appliesToAll: false, discountType: 'percent', value: 60 }),
    );
    const { c } = await asBuyer();
    await addToCart(c, ice);
    const no = await c.post('/api/cart/coupon', { code: coupon.code });
    assert.equal(no.status, 422);
    assert.equal(no.body.error.details.reason, 'NO_ELIGIBLE_ITEMS');
    await addToCart(c, shirt);
    const ok = await c.post('/api/cart/coupon', { code: coupon.code });
    assert.equal(ok.status, 200);
    // 60% of the shirt only (₹300), not of the ice cream.
    assert.equal(ok.body.totals.discountPaise, 30000);
    assert.equal(ok.body.lines.find((l) => l.title === 'Vanilla Ice Cream').discountPaise, 0);
    assert.equal(ok.body.totals.totalPaise, 60000 - 30000);
    // Explicitly adding ice cream makes it eligible.
    await admin.patch(`/api/admin/coupons/${coupon.id}`, {
      productIds: [String(shirt.productId), String(ice.productId)],
    });
    assert.equal((await c.get('/api/cart')).body.totals.discountPaise, 36000);
  });

  it('₹500 product with a ₹100 coupon costs ₹400 before shipping, and tax is on the discounted amount', async () => {
    const { shirt } = await shop();
    const coupon = await makeCoupon({ value: 10000 });
    const { c } = await asBuyer();
    await addToCart(c, shirt);
    const cart = (await c.post('/api/cart/coupon', { code: coupon.code })).body;
    assert.equal(cart.totals.subtotalPaise, 50000);
    assert.equal(cart.totals.discountPaise, 10000);
    assert.equal(cart.totals.totalPaise, 40000);
    assert.equal(cart.totals.taxPaise, Math.floor((40000 * 12 * 2 + 112) / 224)); // 12% GST inside ₹400
    assert.equal(cart.coupon.valid, true);
  });

  it('percentage coupons honour the maximum; fixed coupons never exceed the eligible amount', async () => {
    const { shirt, ice } = await shop();
    const pct = await makeCoupon({ discountType: 'percent', value: 50, maxDiscountPaise: 8000 });
    const big = await makeCoupon({ value: 90000 });
    const { c } = await asBuyer();
    await addToCart(c, shirt);
    assert.equal(
      (await c.post('/api/cart/coupon', { code: pct.code })).body.totals.discountPaise,
      8000,
    );
    assert.equal(
      (await c.post('/api/cart/coupon', { code: big.code })).body.totals.discountPaise,
      50000,
    );
    assert.equal((await c.get('/api/cart')).body.totals.totalPaise, 0);
    await addToCart(c, ice);
    const grown = (await c.get('/api/cart')).body.totals;
    assert.equal(grown.discountPaise, 60000, 'a fixed coupon is capped at the eligible subtotal');
    assert.equal(grown.totalPaise, 0);
  });

  it('rejects unknown, inactive, expired, not-yet-valid and below-minimum coupons with clear reasons', async () => {
    const { shirt } = await shop();
    const { c } = await asBuyer();
    await addToCart(c, shirt);
    const reason = async (code) =>
      (await c.post('/api/cart/coupon', { code })).body.error?.details?.reason;
    assert.equal(await reason('NOSUCHCODE'), 'NOT_FOUND');
    assert.equal(await reason((await makeCoupon({ isActive: false })).code), 'INACTIVE');
    const expired = await makeCoupon({});
    await models.Coupon.updateOne({ _id: expired.id }, { validTo: new Date(Date.now() - 1000) });
    assert.equal(await reason(expired.code), 'EXPIRED');
    assert.equal(
      await reason(
        (
          await makeCoupon({
            validFrom: new Date(Date.now() + day).toISOString(),
            validTo: new Date(Date.now() + 3 * day).toISOString(),
          })
        ).code,
      ),
      'NOT_STARTED',
    );
    assert.equal(
      await reason((await makeCoupon({ minPurchasePaise: 90000 })).code),
      'MIN_PURCHASE',
    );
    assert.equal(
      (await c.get('/api/cart')).body.coupon,
      null,
      'a rejected coupon is never stored on the cart',
    );
  });

  it('targets specific buyers and first-time buyers', async () => {
    const { shirt } = await shop();
    const target = await asBuyer();
    const other = await asBuyer();
    const forOne = await makeCoupon({
      eligibility: { mode: 'buyers', buyerIds: [String(target.u._id)] },
    });
    await addToCart(target.c, shirt);
    await addToCart(other.c, shirt);
    assert.equal((await target.c.post('/api/cart/coupon', { code: forOne.code })).status, 200);
    assert.equal(
      (await other.c.post('/api/cart/coupon', { code: forOne.code })).body.error.details.reason,
      'NOT_ELIGIBLE_BUYER',
    );
    const firstOnly = await makeCoupon({ eligibility: { mode: 'new_buyers', buyerIds: [] } });
    assert.equal((await other.c.post('/api/cart/coupon', { code: firstOnly.code })).status, 200);
    await makeAddress(other.u);
    const a = (await other.c.get('/api/addresses')).body.items[0];
    assert.equal(
      (await other.c.post('/api/checkout', { addressId: a.id, paymentMethod: 'cod' })).status,
      201,
    );
    await addToCart(other.c, shirt);
    assert.equal(
      (await other.c.post('/api/cart/coupon', { code: firstOnly.code })).body.error.details.reason,
      'NOT_NEW_BUYER',
    );
  });
});

describe('coupon redemption lifecycle (apply vs claim vs redeem)', () => {
  it('applying changes no counters; a COD order redeems at once; per-buyer limits then apply', async () => {
    const { shirt } = await shop();
    const admin = await asAdmin();
    const {
      body: { coupon },
    } = await admin.post('/api/admin/coupons', body({ perBuyerLimit: 1 }));
    const { u, c } = await asBuyer();
    const addr = await makeAddress(u);
    await addToCart(c, shirt);
    await c.post('/api/cart/coupon', { code: coupon.code });
    await c.get('/api/cart');
    let doc = await models.Coupon.findById(coupon.id);
    assert.deepEqual([doc.reservedCount, doc.usedCount], [0, 0], 'applying alone claims nothing');

    const order = (
      await c.post('/api/checkout', { addressId: String(addr._id), paymentMethod: 'cod' })
    ).body.order;
    assert.equal(order.totals.discountPaise, 10000);
    doc = await models.Coupon.findById(coupon.id);
    assert.deepEqual([doc.reservedCount, doc.usedCount], [0, 1]);
    assert.equal((await models.CouponRedemption.findOne({ orderId: order.id })).status, 'redeemed');

    await addToCart(c, shirt);
    assert.equal(
      (await c.post('/api/cart/coupon', { code: coupon.code })).body.error.details.reason,
      'PER_BUYER_LIMIT',
    );
    const report = await admin.get(`/api/admin/coupons/${coupon.id}/redemptions`);
    assert.equal(report.body.items[0].orderNumber, order.orderNumber);
    assert.equal((await admin.get('/api/admin/coupons')).body.items[0].totalDiscountPaise, 10000);
  });

  it('the usage limit holds under concurrent checkouts: the last use goes to exactly one buyer', async () => {
    const { shirt } = await shop();
    const admin = await asAdmin();
    const {
      body: { coupon },
    } = await admin.post('/api/admin/coupons', body({ usageLimit: 1 }));
    const buyers = await Promise.all(
      Array.from({ length: 6 }, async () => {
        const b = await asBuyer();
        const addr = await makeAddress(b.u);
        await addToCart(b.c, shirt);
        assert.equal((await b.c.post('/api/cart/coupon', { code: coupon.code })).status, 200);
        return { ...b, addr };
      }),
    );
    const results = await Promise.all(
      buyers.map((b) =>
        b.c.post('/api/checkout', { addressId: String(b.addr._id), paymentMethod: 'cod' }),
      ),
    );
    assert.equal(results.filter((r) => r.status === 201).length, 1);
    assert.ok(results.filter((r) => r.status !== 201).every((r) => [409, 422].includes(r.status)));
    const doc = await models.Coupon.findById(coupon.id);
    assert.deepEqual([doc.usedCount, doc.reservedCount], [1, 0]);
    assert.equal(await models.CouponRedemption.countDocuments({ couponId: coupon.id }), 1);
    // The losers kept their stock: only one order's worth was taken.
    assert.equal((await models.Listing.findById(shirt._id)).stock, 19);
  });

  it('public coupon list shows only active, public, open-to-all coupons', async () => {
    const admin = await asAdmin();
    await admin.post('/api/admin/coupons', body({ title: 'Public one', isPublic: true }));
    await admin.post('/api/admin/coupons', body({ title: 'Hidden one', isPublic: false }));
    await admin.post(
      '/api/admin/coupons',
      body({
        title: 'Buyers only',
        isPublic: true,
        eligibility: { mode: 'new_buyers', buyerIds: [] },
      }),
    );
    await admin.post(
      '/api/admin/coupons',
      body({ title: 'Used up', isPublic: true, usageLimit: 1 }),
    );
    await models.Coupon.updateOne({ title: 'Used up' }, { usedCount: 1 });
    const res = await newClient(app).get('/api/catalog/coupons');
    assert.deepEqual(
      res.body.items.map((c) => c.title),
      ['Public one'],
    );
    assert.equal(res.body.items[0].description, '₹100 off');
  });
});

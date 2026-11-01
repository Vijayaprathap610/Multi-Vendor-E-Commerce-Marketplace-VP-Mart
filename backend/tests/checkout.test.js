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

const buyer = async (over = {}) => {
  const u = await makeUser(over);
  const c = newClient(app);
  assert.equal((await c.login(u.email, PASSWORD)).status, 200);
  const addr = await makeAddress(u);
  return { u, c, addr, addressId: String(addr._id) };
};
const asAdmin = async () => {
  const u = await makeUser({ role: 'admin' });
  const c = newClient(app);
  await c.login(u.email, PASSWORD);
  return c;
};
const add = (c, l, q = 1) => c.post('/api/cart/items', { listingId: String(l._id), quantity: q });
const shipping = (v, charge = 4900, free = 99900) =>
  models.VendorProfile.updateOne(
    { userId: v._id },
    { $set: { 'delivery.shippingChargePaise': charge, 'delivery.freeShippingAbovePaise': free } },
  );
const sum = async (kind, filter = {}) =>
  (
    await models.LedgerEntry.aggregate([
      { $match: { kind, ...filter } },
      { $group: { _id: null, n: { $sum: '$amountPaise' } } },
    ])
  )[0]?.n ?? 0;

describe('saved addresses', () => {
  it('first address becomes default; defaults switch; validation and ownership are enforced', async () => {
    const { c } = await buyer();
    await models.Address.deleteMany({});
    const a = await c.post('/api/addresses', {
      name: 'Asha',
      phone: '9876543210',
      line1: '1 Main Rd',
      city: 'Chennai',
      state: 'Tamil Nadu',
      pincode: '600001',
    });
    assert.equal(a.status, 201);
    assert.equal(a.body.address.isDefault, true);
    const b = await c.post('/api/addresses', {
      name: 'Asha Office',
      phone: '9876543210',
      line1: '2 Park St',
      city: 'Chennai',
      state: 'Tamil Nadu',
      pincode: '600002',
      isDefault: true,
    });
    const list = (await c.get('/api/addresses')).body.items;
    assert.equal(list.filter((x) => x.isDefault).length, 1);
    assert.equal(list[0].id, b.body.address.id);
    assert.equal(
      (
        await c.post('/api/addresses', {
          name: 'X',
          phone: '12',
          line1: 'x',
          city: 'c',
          state: 's',
          pincode: '012345',
        })
      ).status,
      422,
    );
    assert.equal(
      (
        await c.post('/api/addresses', {
          name: 'Asha',
          phone: '9876543210',
          line1: '1 Main Rd',
          city: 'Chennai',
          state: 'TN',
          pincode: '600001',
          userId: 'x',
        })
      ).status,
      422,
    );

    const other = await buyer();
    assert.equal(
      (await other.c.patch(`/api/addresses/${a.body.address.id}`, { city: 'Hacked' })).status,
      404,
    );
    assert.equal((await other.c.del(`/api/addresses/${a.body.address.id}`)).status, 404);
    assert.equal((await c.del(`/api/addresses/${b.body.address.id}`)).status, 200);
    assert.equal(
      (await c.get('/api/addresses')).body.items[0].isDefault,
      true,
      'a remaining address becomes the default',
    );
  });

  it('caps saved addresses and requires a buyer', async () => {
    const { c, u } = await buyer();
    for (let i = 0; i < 9; i++) await makeAddress(u, { isDefault: false, line1: `${i} Road` });
    const over = await c.post('/api/addresses', {
      name: 'A B',
      phone: '9876543210',
      line1: '1 Main Rd',
      city: 'Chennai',
      state: 'TN',
      pincode: '600001',
    });
    assert.equal(over.status, 409);
    assert.equal((await newClient(app).get('/api/addresses')).status, 401);
    const v = await makeVendor();
    const vc = newClient(app);
    await vc.login(v.email, PASSWORD);
    assert.equal((await vc.get('/api/addresses')).status, 403);
  });
});

describe('COD checkout: totals, shipments, commission, ledger', () => {
  it('creates a confirmed order with one shipment per vendor and consistent server-side money', async () => {
    const v1 = await makeVendor({ shop: 'Seller One' });
    const v2 = await makeVendor({ shop: 'Seller Two' });
    await shipping(v1);
    await shipping(v2);
    const a = await makeListing(v1, {
      name: 'Shirt',
      pricePaise: 50000,
      mrpPaise: 50000,
      stock: 10,
    });
    const b = await makeListing(v2, {
      name: 'Trousers',
      pricePaise: 20000,
      mrpPaise: 20000,
      stock: 10,
    });
    const { c, addressId, u } = await buyer();
    await add(c, a);
    await add(c, b, 1);
    const res = await c.post('/api/checkout', { addressId, paymentMethod: 'cod' });
    assert.equal(res.status, 201);
    const o = res.body.order;
    assert.equal(o.status, 'confirmed');
    assert.equal(o.paymentStatus, 'cod_pending');
    assert.match(o.orderNumber, /^VPM-\d{8}-[0-9A-F]{6}$/);
    assert.equal(o.shipments.length, 2);
    assert.ok(
      o.shipments.every(
        (s) => s.status === 'confirmed' && s.estimate?.earliest && s.timeline.length === 1,
      ),
    );
    assert.equal(o.totals.subtotalPaise, 70000);
    assert.equal(o.totals.shippingPaise, 9800);
    assert.equal(o.totals.totalPaise, 79800);
    assert.equal(o.address.pincode, '600001');

    assert.equal((await models.Listing.findById(a._id)).stock, 9);
    assert.equal((await models.Listing.findById(a._id)).soldCount, 1);
    assert.equal(
      (await c.get('/api/cart')).body.lines.length,
      0,
      'cart is emptied after a COD order',
    );
    const pay = await models.Payment.findOne({ orderId: o.id });
    assert.deepEqual([pay.method, pay.status, pay.amountPaise], ['cod', 'cod_pending', 79800]);

    // Money reconciles: items + shipping = total, and commission + vendor share = net, to the paisa.
    const items = await models.OrderItem.find({ orderId: o.id }).lean();
    assert.equal(items.reduce((n, i) => n + i.netPaise, 0) + 9800, 79800);
    for (const i of items) assert.equal(i.commissionPaise + i.vendorSharePaise, i.netPaise);
    assert.equal(items.find((i) => i.title === 'Shirt').commissionPaise, 5000);
    assert.equal(items.find((i) => i.title === 'Shirt').vendorSharePaise, 45000);
    assert.equal(await sum('sale'), 70000);
    assert.equal((await sum('commission')) + (await sum('vendor_share')), 70000);
    assert.equal(await sum('shipping'), 9800);
    assert.equal(await models.LedgerEntry.countDocuments(), 3 * 2 + 2);

    const notes = await models.Notification.find().lean();
    assert.equal(
      notes.filter((n) => n.type === 'order.confirmed' && String(n.userId) === String(u._id))
        .length,
      1,
    );
    assert.equal(notes.filter((n) => n.type === 'order.new').length, 2);
  });

  it('commission follows the configured rate: ₹1,000 at 10% gives ₹100 / ₹900; a new rate affects only new orders', async () => {
    const v = await makeVendor();
    const l = await makeListing(v, { pricePaise: 100000, mrpPaise: 100000, stock: 10 });
    const { c, addressId } = await buyer();
    await add(c, l);
    const first = (await c.post('/api/checkout', { addressId, paymentMethod: 'cod' })).body.order;
    const i1 = await models.OrderItem.findOne({ orderId: first.id });
    assert.deepEqual(
      [i1.commissionPaise, i1.vendorSharePaise, i1.commissionPercent],
      [10000, 90000, 10],
    );

    const admin = await asAdmin();
    assert.equal(
      (await admin.put('/api/admin/settings', { commissionPercent: 12.5 })).body.commissionPercent,
      12.5,
    );
    assert.equal((await admin.get('/api/admin/settings')).body.commissionPercent, 12.5);
    await add(c, l);
    const second = (await c.post('/api/checkout', { addressId, paymentMethod: 'cod' })).body.order;
    const i2 = await models.OrderItem.findOne({ orderId: second.id });
    assert.deepEqual([i2.commissionPaise, i2.vendorSharePaise], [12500, 87500]);
    assert.equal(
      (await models.OrderItem.findById(i1._id)).commissionPaise,
      10000,
      'old orders keep their rate',
    );
    assert.equal((await admin.put('/api/admin/settings', { commissionPercent: 99 })).status, 422);
  });

  it('commission is computed on the discounted amount, with no rounding drift', async () => {
    const v = await makeVendor();
    const l = await makeListing(v, { pricePaise: 33333, mrpPaise: 33333, stock: 10 });
    const admin = await asAdmin();
    const {
      body: { coupon },
    } = await admin.post('/api/admin/coupons', {
      discountType: 'percent',
      value: 15,
      validFrom: new Date(Date.now() - 1e6).toISOString(),
      validTo: new Date(Date.now() + 1e9).toISOString(),
      appliesToAll: true,
    });
    const { c, addressId } = await buyer();
    await add(c, l, 3);
    await c.post('/api/cart/coupon', { code: coupon.code });
    const o = (await c.post('/api/checkout', { addressId, paymentMethod: 'cod' })).body.order;
    const it = await models.OrderItem.findOne({ orderId: o.id });
    assert.equal(it.linePaise, 99999);
    assert.equal(it.discountPaise, Math.floor((99999 * 15) / 100));
    assert.equal(it.netPaise, 99999 - it.discountPaise);
    assert.equal(it.commissionPaise + it.vendorSharePaise, it.netPaise);
    assert.equal(o.totals.totalPaise, it.netPaise);
    assert.ok(Number.isInteger(it.commissionPaise) && Number.isInteger(it.taxPaise));
  });

  it('Buy Now orders one product without touching the cart', async () => {
    const v = await makeVendor();
    const keep = await makeListing(v, { name: 'In Cart', stock: 5 });
    const now = await makeListing(v, {
      name: 'Buy Now Item',
      pricePaise: 25000,
      mrpPaise: 25000,
      stock: 5,
    });
    const { c, addressId } = await buyer();
    await add(c, keep, 2);
    const res = await c.post('/api/checkout', {
      addressId,
      paymentMethod: 'cod',
      buyNow: { listingId: String(now._id), quantity: 2 },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.order.totals.subtotalPaise, 50000);
    assert.equal(res.body.order.shipments[0].items[0].title, 'Buy Now Item');
    const cart = (await c.get('/api/cart')).body;
    assert.equal(cart.lines.length, 1);
    assert.equal(cart.lines[0].quantity, 2);
  });

  it('always charges the current server price, never anything the browser says', async () => {
    const v = await makeVendor();
    const l = await makeListing(v, { pricePaise: 50000, mrpPaise: 60000, stock: 5 });
    const { c, addressId } = await buyer();
    await add(c, l);
    const preview = (await c.post('/api/checkout/preview', { addressId })).body;
    assert.equal(preview.totals.totalPaise, 50000);
    await models.Listing.updateOne({ _id: l._id }, { pricePaise: 55000 });
    await (await import('../src/services/cache.js')).catalogChanged();
    const o = (await c.post('/api/checkout', { addressId, paymentMethod: 'cod' })).body.order;
    assert.equal(o.totals.totalPaise, 55000);
    await add(c, l);
    for (const extra of [
      { totalPaise: 1 },
      { items: [{ listingId: String(l._id), quantity: 1, pricePaise: 1 }] },
      { discountPaise: 99999 },
    ]) {
      assert.equal(
        (await c.post('/api/checkout', { addressId, paymentMethod: 'cod', ...extra })).status,
        422,
      );
    }
  });
});

describe('stock safety', () => {
  it('never oversells: 8 buyers race for 3 units and exactly 3 win', async () => {
    const v = await makeVendor();
    const l = await makeListing(v, { stock: 3 });
    const buyers = await Promise.all(
      Array.from({ length: 8 }, async () => {
        const b = await buyer();
        await add(b.c, l);
        return b;
      }),
    );
    const res = await Promise.all(
      buyers.map((b) =>
        b.c.post('/api/checkout', { addressId: b.addressId, paymentMethod: 'cod' }),
      ),
    );
    assert.equal(res.filter((r) => r.status === 201).length, 3);
    assert.ok(res.filter((r) => r.status !== 201).every((r) => r.status === 409));
    const after = await models.Listing.findById(l._id);
    assert.deepEqual([after.stock, after.soldCount], [0, 3]);
    assert.equal(await models.Order.countDocuments(), 3);
    assert.equal(await models.OrderItem.countDocuments(), 3);
  });

  it('a failed order leaves no trace: partial stock reservations roll back', async () => {
    const v = await makeVendor();
    const plenty = await makeListing(v, { name: 'Plenty', stock: 10 });
    const scarce = await makeListing(v, { name: 'Scarce', stock: 1 });
    const { c, addressId } = await buyer();
    await add(c, plenty, 2);
    await add(c, scarce, 1);
    await models.Listing.updateOne({ _id: scarce._id }, { stock: 0 });
    await (await import('../src/services/cache.js')).catalogChanged();
    const res = await c.post('/api/checkout', { addressId, paymentMethod: 'cod' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'CART_ISSUES');
    assert.equal((await models.Listing.findById(plenty._id)).stock, 10);
    assert.equal(await models.Order.countDocuments(), 0);
  });

  it('two quantity-heavy buyers cannot both take the same units', async () => {
    const v = await makeVendor();
    const l = await makeListing(v, { stock: 5 });
    const [a, b] = await Promise.all([buyer(), buyer()]);
    await add(a.c, l, 3);
    await add(b.c, l, 3);
    const res = await Promise.all(
      [a, b].map((x) =>
        x.c.post('/api/checkout', { addressId: x.addressId, paymentMethod: 'cod' }),
      ),
    );
    assert.deepEqual(res.map((r) => r.status).sort(), [201, 409]);
    assert.equal((await models.Listing.findById(l._id)).stock, 2);
  });
});

describe('checkout validation and delivery rules', () => {
  it('rejects empty carts, bad or foreign addresses, online without a provider, and wrong roles', async () => {
    const v = await makeVendor();
    const l = await makeListing(v);
    const { c, addressId } = await buyer();
    assert.equal(
      (await c.post('/api/checkout', { addressId, paymentMethod: 'cod' })).body.error.code,
      'CART_EMPTY',
    );
    await add(c, l);
    assert.equal(
      (
        await c.post('/api/checkout', {
          addressId: '64b000000000000000000000',
          paymentMethod: 'cod',
        })
      ).status,
      422,
    );
    const other = await buyer();
    assert.equal(
      (await c.post('/api/checkout', { addressId: other.addressId, paymentMethod: 'cod' })).status,
      422,
    );
    const online = await c.post('/api/checkout', { addressId, paymentMethod: 'online' });
    assert.equal(online.status, 409);
    assert.equal(online.body.error.code, 'ONLINE_PAYMENT_UNAVAILABLE');
    assert.equal(await models.Order.countDocuments(), 0);
    assert.equal(
      (await c.post('/api/checkout', { addressId, paymentMethod: 'barter' })).status,
      422,
    );
    assert.equal(
      (await newClient(app).post('/api/checkout', { addressId, paymentMethod: 'cod' })).status,
      401,
    );
    const vc = newClient(app);
    await vc.login(v.email, PASSWORD);
    assert.equal((await vc.post('/api/checkout', { addressId, paymentMethod: 'cod' })).status, 403);
  });

  it('blocks orders a seller cannot deliver to that address, and explains which items', async () => {
    const v = await makeVendor();
    const ice = await makeListing(v, {
      name: 'Ice Cream Tub',
      category: await catByName('Ice Cream'),
      stock: 5,
      extra: { expiryDate: new Date(Date.now() + 9e9) },
    });
    const { c, addressId, u } = await buyer();
    await add(c, ice);
    const preview = (await c.post('/api/checkout/preview', { addressId })).body;
    assert.match(preview.delivery.blocked['Ice Cream Tub'], /nearby/);
    const res = await c.post('/api/checkout', { addressId, paymentMethod: 'cod' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'UNDELIVERABLE');
    assert.ok(res.body.error.details['Ice Cream Tub']);
    assert.equal((await models.Listing.findById(ice._id)).stock, 5);
    const near = await makeAddress(u, { pincode: '641042', isDefault: false });
    assert.equal(
      (await c.post('/api/checkout', { addressId: String(near._id), paymentMethod: 'cod' })).status,
      201,
    );
  });

  it('honours seller coverage areas', async () => {
    const v = await makeVendor();
    await models.VendorProfile.updateOne(
      { userId: v._id },
      { $set: { 'delivery.coverage': { mode: 'prefixes', pincodePrefixes: ['641'] } } },
    );
    const l = await makeListing(v);
    const { c, addressId } = await buyer();
    await add(c, l);
    assert.equal(
      (await c.post('/api/checkout', { addressId, paymentMethod: 'cod' })).body.error.code,
      'UNDELIVERABLE',
    );
  });
});

describe('orders: access, privacy and cancellation', () => {
  async function placed({ coupon } = {}) {
    const v = await makeVendor({ shop: 'Privacy Shop' });
    const l = await makeListing(v, { pricePaise: 40000, mrpPaise: 40000, stock: 5 });
    const b = await buyer({ name: 'Priya Natarajan' });
    await add(b.c, l, 2);
    if (coupon) await b.c.post('/api/cart/coupon', { code: coupon });
    const order = (
      await b.c.post('/api/checkout', { addressId: b.addressId, paymentMethod: 'cod' })
    ).body.order;
    return { v, l, b, order };
  }

  it('buyers see only their own orders; vendors and admins see only what they need', async () => {
    const { v, b, order } = await placed();
    const list = (await b.c.get('/api/orders')).body;
    assert.equal(list.total, 1);
    assert.equal(list.items[0].itemCount, 2);
    assert.equal(
      (await b.c.get(`/api/orders/${order.id}`)).body.order.address.line1,
      '12 Lake View Road',
    );
    const stranger = await buyer();
    assert.equal((await stranger.c.get(`/api/orders/${order.id}`)).status, 404);
    assert.equal((await stranger.c.post(`/api/orders/${order.id}/cancel`, {})).status, 404);
    assert.equal((await stranger.c.get('/api/orders')).body.total, 0);

    const vc = newClient(app);
    await vc.login(v.email, PASSWORD);
    const vo = (await vc.get('/api/vendor/orders')).body.items[0];
    assert.equal(vo.shipTo.firstName, 'Asha'); // the name on the delivery address
    assert.equal(vo.shipTo.city, 'Chennai');
    assert.ok(
      !JSON.stringify(vo).match(/9876543210|Lake View|Natarajan/),
      'no phone, street or surname for sellers',
    );
    assert.equal(vo.vendorPayablePaise, 72000);
    const otherVendor = await makeVendor({ shop: 'Other Seller' });
    const ovc = newClient(app);
    await ovc.login(otherVendor.email, PASSWORD);
    assert.equal((await ovc.get('/api/vendor/orders')).body.total, 0);

    const admin = await asAdmin();
    const ao = (await admin.get(`/api/admin/orders/${order.id}`)).body.order;
    assert.ok(
      !JSON.stringify(ao).match(/9876543210|Lake View/),
      'admin view omits phone and street',
    );
    assert.equal(ao.address.city, 'Chennai');
    assert.equal(
      ao.ledger[0].commissionPaise + ao.ledger[0].vendorSharePaise,
      ao.ledger[0].netPaise,
    );
    const stranger2 = await stranger.c.get('/api/admin/orders');
    assert.equal(stranger2.status, 403);
    assert.equal((await admin.get('/api/admin/orders?status=confirmed&q=VPM')).body.total, 1);
  });

  it('cancelling a confirmed order restores stock and sales, and nets the ledger to zero', async () => {
    const { l, b, order } = await placed();
    assert.equal((await models.Listing.findById(l._id)).stock, 3);
    const res = await b.c.post(`/api/orders/${order.id}/cancel`, { reason: 'Changed my mind' });
    assert.equal(res.status, 200);
    assert.equal(res.body.order.status, 'cancelled');
    assert.ok(res.body.order.shipments.every((s) => s.status === 'cancelled'));
    const after = await models.Listing.findById(l._id);
    assert.deepEqual([after.stock, after.soldCount], [5, 0]);
    for (const [sale, refund] of [
      ['sale', 'refund_sale'],
      ['commission', 'refund_commission'],
      ['vendor_share', 'refund_vendor_share'],
    ])
      assert.equal((await sum(sale)) + (await sum(refund)), 0, sale);
    assert.equal(
      (await b.c.post(`/api/orders/${order.id}/cancel`, {})).status,
      409,
      'cannot cancel twice',
    );
    assert.equal(await models.LedgerEntry.countDocuments({ kind: /^refund/ }), 3);
  });

  it('cancelling gives a redeemed coupon use back', async () => {
    const admin = await asAdmin();
    const {
      body: { coupon },
    } = await admin.post('/api/admin/coupons', {
      discountType: 'fixed',
      value: 5000,
      validFrom: new Date(Date.now() - 1e6).toISOString(),
      validTo: new Date(Date.now() + 1e9).toISOString(),
      appliesToAll: true,
      usageLimit: 1,
    });
    const { b, order } = await placed({ coupon: coupon.code });
    assert.equal((await models.Coupon.findById(coupon.id)).usedCount, 1);
    await b.c.post(`/api/orders/${order.id}/cancel`, {});
    const doc = await models.Coupon.findById(coupon.id);
    assert.deepEqual([doc.usedCount, doc.reservedCount], [0, 0]);
    assert.equal((await models.CouponRedemption.findOne({ orderId: order.id })).status, 'released');
  });

  it('is too late to cancel once a seller has handed the parcel to delivery', async () => {
    const { b, order } = await placed();
    await models.Shipment.updateMany({ orderId: order.id }, { status: 'picked_up' });
    const res = await b.c.post(`/api/orders/${order.id}/cancel`, {});
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'TOO_LATE');
    assert.equal((await models.Order.findById(order.id)).status, 'confirmed');
    assert.equal((await b.c.get(`/api/orders/${order.id}`)).body.order.cancellable, false);
  });

  it('keeps order history intact when listings, prices or addresses change later', async () => {
    const { l, b, order } = await placed();
    await models.Listing.updateOne({ _id: l._id }, { pricePaise: 99999, title: 'Renamed' });
    await b.c.del(`/api/addresses/${b.addressId}`);
    const o = (await b.c.get(`/api/orders/${order.id}`)).body.order;
    assert.equal(o.shipments[0].items[0].unitPaise, 40000);
    assert.notEqual(o.shipments[0].items[0].title, 'Renamed');
    assert.equal(o.address.line1, '12 Lake View Road');
  });
});

describe('notifications', () => {
  it('are stored per user, listed with an unread count, and can be marked read', async () => {
    const v = await makeVendor();
    const l = await makeListing(v);
    const { c, addressId } = await buyer();
    await add(c, l);
    await c.post('/api/checkout', { addressId, paymentMethod: 'cod' });
    const list = (await c.get('/api/notifications')).body;
    assert.equal(list.unreadCount, 1);
    assert.equal(list.items[0].type, 'order.confirmed');
    assert.equal((await c.post('/api/notifications/read', {})).status, 422);
    assert.equal(
      (await c.post('/api/notifications/read', { ids: [list.items[0].id] })).body.updated,
      1,
    );
    assert.equal((await c.get('/api/notifications?unread=true')).body.items.length, 0);
    const vc = newClient(app);
    await vc.login(v.email, PASSWORD);
    assert.equal((await vc.get('/api/notifications')).body.items[0].type, 'order.new');
    // Cannot read or mark someone else's notifications.
    assert.equal(
      (await vc.post('/api/notifications/read', { ids: [list.items[0].id] })).body.updated,
      0,
    );
    assert.equal((await newClient(app).get('/api/notifications')).status, 401);
  });
});

// The Razorpay API CLIENT is replaced by a recording stand-in (it needs real keys). Everything
// else is real: our HMAC signature verification, idempotency, transactions and state machine.
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  KEY_SECRET,
  PASSWORD,
  createApp,
  installFakeProvider,
  makeAddress,
  makeListing,
  makeUser,
  makeVendor,
  models,
  newClient,
  rawPost,
  removeFakeProvider,
  resetDb,
  seedCategories,
  setupDb,
  sign,
  signBody,
  teardownDb,
} from './helpers.js';
import { expireStaleOrders } from '../src/services/orderService.js';
import { initiateRefund } from '../src/services/paymentService.js';

let app;
let calls;
before(async () => {
  await setupDb();
  app = createApp();
});
after(async () => {
  removeFakeProvider();
  await teardownDb();
});
beforeEach(async () => {
  await resetDb();
  await seedCategories();
  ({ calls } = installFakeProvider());
});

const admin = async () => {
  const u = await makeUser({ role: 'admin' });
  const c = newClient(app);
  await c.login(u.email, PASSWORD);
  return c;
};
const day = 86400000;
async function onlineOrder({ qty = 2, price = 40000, coupon, stock = 10 } = {}) {
  const v = await makeVendor({ shop: 'Pay Shop' });
  const l = await makeListing(v, { pricePaise: price, mrpPaise: price, stock });
  const u = await makeUser();
  const c = newClient(app);
  await c.login(u.email, PASSWORD);
  const addr = await makeAddress(u);
  await c.post('/api/cart/items', { listingId: String(l._id), quantity: qty });
  if (coupon) await c.post('/api/cart/coupon', { code: coupon });
  const res = await c.post('/api/checkout', {
    addressId: String(addr._id),
    paymentMethod: 'online',
    ...(coupon ? { couponCode: coupon } : {}),
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const pay = await models.Payment.findOne({ orderId: res.body.order.id });
  return { v, l, u, c, res, order: res.body.order, pay, rz: res.body.payment.razorpay };
}
const verify = (c, o, paymentId = 'pay_test_0001', signature) =>
  c.post('/api/payments/verify', {
    orderId: o.order.id,
    razorpayPaymentId: paymentId,
    razorpaySignature: signature ?? sign(o.pay.providerOrderId, paymentId),
  });
const webhook = (
  event,
  body,
  { sig, id = `evt_${Math.random().toString(36).slice(2, 9)}` } = {},
) => {
  const raw = JSON.stringify(body);
  return rawPost(app, '/api/webhooks/razorpay', raw, {
    'x-razorpay-signature': sig ?? signBody(raw),
    'x-razorpay-event-id': id,
    'x-event': event,
  });
};
const captured = (o, id = 'pay_wh_0001', amount) => ({
  event: 'payment.captured',
  payload: {
    payment: {
      entity: {
        id,
        order_id: o.pay.providerOrderId,
        amount: amount ?? o.pay.amountPaise,
        status: 'captured',
      },
    },
  },
});
const failed = (o, id = 'pay_wh_fail') => ({
  event: 'payment.failed',
  payload: {
    payment: {
      entity: { id, order_id: o.pay.providerOrderId, error_description: 'Card declined' },
    },
  },
});
const ledgerCount = () => models.LedgerEntry.countDocuments();

describe('starting an online payment', () => {
  it('creates a pending order that holds stock, exposes only public checkout data, and keeps the cart', async () => {
    const admin1 = await admin();
    const {
      body: { coupon },
    } = await admin1.post('/api/admin/coupons', {
      discountType: 'fixed',
      value: 5000,
      validFrom: new Date(Date.now() - day).toISOString(),
      validTo: new Date(Date.now() + day).toISOString(),
      appliesToAll: true,
    });
    const o = await onlineOrder({ coupon: coupon.code });
    assert.equal(o.order.status, 'pending_payment');
    assert.equal(o.order.paymentStatus, 'pending');
    assert.equal(o.rz.keyId, 'rzp_test_fake');
    assert.equal(o.rz.amountPaise, 75000);
    assert.match(o.rz.orderId, /^order_/);
    assert.ok(
      !JSON.stringify(o.res.body).includes(KEY_SECRET),
      'the key secret never reaches the browser',
    );
    assert.deepEqual(
      [calls.orders[0].amountPaise, calls.orders[0].receipt],
      [75000, o.order.orderNumber],
    );
    assert.equal(o.pay.providerOrderId, o.rz.orderId);
    const listing = await models.Listing.findById(o.l._id);
    assert.deepEqual(
      [listing.stock, listing.soldCount],
      [8, 0],
      'stock is held, nothing counted as sold yet',
    );
    assert.equal(
      (await o.c.get('/api/cart')).body.lines.length,
      1,
      'cart stays until payment succeeds',
    );
    const doc = await models.Coupon.findById(coupon.id);
    assert.deepEqual([doc.reservedCount, doc.usedCount], [1, 0], 'claimed but not yet redeemed');
    assert.ok(new Date(o.res.body.order.expiresAt) > new Date());
    assert.equal(await ledgerCount(), 0, 'no money is booked before payment');
    const vc = newClient(app);
    await vc.login(o.v.email, PASSWORD);
    assert.equal(
      (await vc.get('/api/vendor/orders')).body.total,
      0,
      'sellers do not see unpaid orders',
    );
  });

  it('undoes everything if the provider cannot create the payment', async () => {
    removeFakeProvider();
    installFakeProvider({
      createOrder: async () => {
        throw new Error('provider down');
      },
    });
    const v = await makeVendor();
    const l = await makeListing(v, { stock: 5 });
    const u = await makeUser();
    const c = newClient(app);
    await c.login(u.email, PASSWORD);
    const addr = await makeAddress(u);
    await c.post('/api/cart/items', { listingId: String(l._id), quantity: 2 });
    const res = await c.post('/api/checkout', {
      addressId: String(addr._id),
      paymentMethod: 'online',
    });
    assert.equal(res.status, 502);
    assert.equal(res.body.error.code, 'PAYMENT_PROVIDER_ERROR');
    assert.equal((await models.Listing.findById(l._id)).stock, 5);
    assert.equal((await models.Order.findOne()).status, 'payment_failed');
    assert.equal((await models.Payment.findOne()).status, 'failed');
    assert.equal((await c.get('/api/cart')).body.lines.length, 1);
  });
});

describe('verifying the payment (checkout signature)', () => {
  it('a valid signature confirms the order, books the ledger, redeems the coupon and clears the cart', async () => {
    const admin1 = await admin();
    const {
      body: { coupon },
    } = await admin1.post('/api/admin/coupons', {
      discountType: 'fixed',
      value: 5000,
      validFrom: new Date(Date.now() - day).toISOString(),
      validTo: new Date(Date.now() + day).toISOString(),
      appliesToAll: true,
    });
    const o = await onlineOrder({ coupon: coupon.code });
    const res = await verify(o.c, o);
    assert.equal(res.status, 200);
    assert.equal(res.body.applied, true);
    assert.equal(res.body.order.status, 'confirmed');
    assert.equal(res.body.order.paymentStatus, 'successful');
    const pay = await models.Payment.findById(o.pay._id);
    assert.deepEqual(
      [pay.status, pay.verifiedVia, pay.providerPaymentId],
      ['successful', 'checkout_signature', 'pay_test_0001'],
    );
    assert.ok(pay.verifiedAt);
    assert.ok(res.body.order.shipments.every((s) => s.status === 'confirmed'));
    assert.equal((await models.Listing.findById(o.l._id)).soldCount, 2);
    assert.equal((await o.c.get('/api/cart')).body.lines.length, 0);
    const doc = await models.Coupon.findById(coupon.id);
    assert.deepEqual([doc.reservedCount, doc.usedCount], [0, 1]);
    assert.equal(await models.LedgerEntry.countDocuments({ kind: 'sale' }), 1);
    assert.equal(await ledgerCount(), 3);
    const types = (await models.Notification.find().lean()).map((n) => n.type).sort();
    assert.deepEqual(types, ['order.confirmed', 'order.new', 'payment.success']);
    const vc = newClient(app);
    await vc.login(o.v.email, PASSWORD);
    assert.equal((await vc.get('/api/vendor/orders')).body.total, 1);
  });

  it('refuses forged, mismatched and foreign signatures and changes nothing', async () => {
    const o = await onlineOrder();
    for (const sig of [
      'deadbeef'.repeat(8),
      sign(o.pay.providerOrderId, 'pay_different'),
      sign('order_other', 'pay_test_0001'),
      'x',
    ]) {
      const res = await verify(o.c, o, 'pay_test_0001', sig);
      assert.equal(res.status, res.body.error?.code === 'VALIDATION_ERROR' ? 422 : 400, sig);
    }
    assert.equal((await models.Payment.findById(o.pay._id)).status, 'pending');
    assert.equal((await models.Order.findById(o.order.id)).status, 'pending_payment');
    assert.equal((await models.Listing.findById(o.l._id)).soldCount, 0);
    assert.equal(await ledgerCount(), 0);
    const stranger = await makeUser();
    const sc = newClient(app);
    await sc.login(stranger.email, PASSWORD);
    assert.equal((await verify(sc, o)).status, 404, 'cannot verify someone else’s order');
    assert.equal(
      (
        await newClient(app).post('/api/payments/verify', {
          orderId: o.order.id,
          razorpayPaymentId: 'pay_x1234',
          razorpaySignature: 'a'.repeat(64),
        })
      ).status,
      401,
    );
  });

  it('is idempotent: repeating or racing the callback books everything exactly once', async () => {
    const o = await onlineOrder({ qty: 3 });
    const first = await verify(o.c, o);
    assert.equal(first.body.applied, true);
    const again = await verify(o.c, o);
    assert.equal(again.status, 200);
    assert.equal(again.body.applied, false);
    assert.equal((await models.Listing.findById(o.l._id)).soldCount, 3);
    assert.equal(await ledgerCount(), 3);

    const racing = await onlineOrder({ qty: 2 });
    const results = await Promise.all(Array.from({ length: 6 }, () => verify(racing.c, racing)));
    assert.equal(results.filter((r) => r.body.applied === true).length, 1);
    assert.ok(results.every((r) => r.status === 200));
    assert.equal((await models.Listing.findById(racing.l._id)).soldCount, 2);
    assert.equal(await models.LedgerEntry.countDocuments({ orderId: racing.order.id }), 3);
  });

  it('COD orders have nothing to verify', async () => {
    const v = await makeVendor();
    const l = await makeListing(v);
    const u = await makeUser();
    const c = newClient(app);
    await c.login(u.email, PASSWORD);
    const addr = await makeAddress(u);
    await c.post('/api/cart/items', { listingId: String(l._id), quantity: 1 });
    const order = (
      await c.post('/api/checkout', { addressId: String(addr._id), paymentMethod: 'cod' })
    ).body.order;
    assert.equal(
      (
        await c.post('/api/payments/verify', {
          orderId: order.id,
          razorpayPaymentId: 'pay_x1234',
          razorpaySignature: 'a'.repeat(64),
        })
      ).status,
      404,
    );
  });
});

describe('provider webhooks', () => {
  it('a correctly signed capture confirms the order; the same event replayed does nothing more', async () => {
    const o = await onlineOrder();
    const res = await webhook('captured', captured(o), { id: 'evt_same' });
    assert.equal(res.status, 200);
    assert.equal(res.body.result, 'applied');
    assert.equal((await models.Payment.findById(o.pay._id)).verifiedVia, 'webhook');
    assert.equal((await models.Order.findById(o.order.id)).status, 'confirmed');
    const ledger = await ledgerCount();
    const replay = await webhook('captured', captured(o), { id: 'evt_same' });
    assert.equal(replay.body.duplicate, true);
    assert.equal(await ledgerCount(), ledger);
    assert.equal((await models.Listing.findById(o.l._id)).soldCount, 2);
    assert.equal(await models.WebhookEvent.countDocuments({ eventId: 'evt_same' }), 1);
    // The browser callback arriving afterwards is a harmless no-op.
    assert.equal((await verify(o.c, o)).body.applied, false);
    assert.equal(await ledgerCount(), ledger);
  });

  it('rejects unsigned, wrongly signed and tampered webhooks without any effect', async () => {
    const o = await onlineOrder();
    const raw = JSON.stringify(captured(o));
    assert.equal((await rawPost(app, '/api/webhooks/razorpay', raw, {})).status, 401);
    assert.equal(
      (
        await rawPost(app, '/api/webhooks/razorpay', raw, {
          'x-razorpay-signature': 'f'.repeat(64),
        })
      ).status,
      401,
    );
    const tampered = raw.replace(String(o.pay.amountPaise), '1');
    assert.equal(
      (
        await rawPost(app, '/api/webhooks/razorpay', tampered, {
          'x-razorpay-signature': signBody(raw),
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await rawPost(app, '/api/webhooks/razorpay', raw, {
          'x-razorpay-signature': signBody(raw.slice(1)),
        })
      ).status,
      401,
    );
    assert.equal((await models.Payment.findById(o.pay._id)).status, 'pending');
    assert.equal(await models.WebhookEvent.countDocuments(), 0);
  });

  it('does not confirm when the paid amount differs from the order, and alerts admins', async () => {
    const o = await onlineOrder();
    await admin();
    const res = await webhook('captured', captured(o, 'pay_short', o.pay.amountPaise - 100));
    assert.equal(res.status, 200);
    assert.equal(res.body.result, 'ignored');
    assert.equal((await models.Payment.findById(o.pay._id)).status, 'pending');
    assert.equal((await models.Order.findById(o.order.id)).status, 'pending_payment');
    assert.equal(await models.Notification.countDocuments({ type: 'payment.mismatch' }), 1);
  });

  it('a failed payment cancels the order, returns stock and coupon use, and alerts admins', async () => {
    const admin1 = await admin();
    const {
      body: { coupon },
    } = await admin1.post('/api/admin/coupons', {
      discountType: 'fixed',
      value: 5000,
      validFrom: new Date(Date.now() - day).toISOString(),
      validTo: new Date(Date.now() + day).toISOString(),
      appliesToAll: true,
    });
    const o = await onlineOrder({ coupon: coupon.code });
    const res = await webhook('failed', failed(o));
    assert.equal(res.body.result, 'applied');
    const order = await models.Order.findById(o.order.id);
    assert.deepEqual([order.status, order.paymentStatus], ['payment_failed', 'failed']);
    const pay = await models.Payment.findById(o.pay._id);
    assert.deepEqual([pay.status, pay.failureReason], ['failed', 'Card declined']);
    assert.equal((await models.Listing.findById(o.l._id)).stock, 10);
    const doc = await models.Coupon.findById(coupon.id);
    assert.deepEqual([doc.reservedCount, doc.usedCount], [0, 0]);
    assert.equal(
      (await models.CouponRedemption.findOne({ orderId: o.order.id })).status,
      'released',
    );
    assert.equal(
      (await o.c.get('/api/cart')).body.lines.length,
      1,
      'the cart survives so the buyer can retry',
    );
    assert.equal(await models.Notification.countDocuments({ type: 'payment.failed' }), 1);
    assert.equal(await ledgerCount(), 0);
    const list = (await admin1.get('/api/admin/payments?status=failed')).body.items;
    assert.equal(list[0].failureReason, 'Card declined');
    assert.ok(!JSON.stringify(list).includes(KEY_SECRET));
  });

  it('ignores event types it does not handle, and works without cookies or CSRF tokens', async () => {
    const res = await webhook('x', { event: 'subscription.charged', payload: {} });
    assert.equal(res.status, 200);
    assert.equal(res.body.result, 'ignored');
  });

  it('the buyer can report a cancelled or failed payment attempt, but only for their own order', async () => {
    const o = await onlineOrder();
    const stranger = await makeUser();
    const sc = newClient(app);
    await sc.login(stranger.email, PASSWORD);
    assert.equal((await sc.post('/api/payments/failed', { orderId: o.order.id })).status, 404);
    const res = await o.c.post('/api/payments/failed', {
      orderId: o.order.id,
      reason: 'Closed the payment window',
    });
    assert.equal(res.body.applied, true);
    assert.equal((await models.Order.findById(o.order.id)).status, 'payment_failed');
    assert.equal((await models.Listing.findById(o.l._id)).stock, 10);
  });
});

describe('expiry and late payments', () => {
  it('unpaid orders expire, release stock and coupon, and cannot be confirmed later without a refund', async () => {
    const admin1 = await admin();
    const {
      body: { coupon },
    } = await admin1.post('/api/admin/coupons', {
      discountType: 'fixed',
      value: 5000,
      validFrom: new Date(Date.now() - day).toISOString(),
      validTo: new Date(Date.now() + day).toISOString(),
      appliesToAll: true,
    });
    const o = await onlineOrder({ coupon: coupon.code });
    const fresh = await onlineOrder();
    await models.Order.updateOne({ _id: o.order.id }, { expiresAt: new Date(Date.now() - 1000) });
    assert.equal(await expireStaleOrders(), 1);
    assert.equal((await models.Order.findById(o.order.id)).status, 'cancelled');
    assert.equal(
      (await models.Order.findById(fresh.order.id)).status,
      'pending_payment',
      'only overdue orders expire',
    );
    assert.equal((await models.Listing.findById(o.l._id)).stock, 10);
    assert.equal((await models.Coupon.findById(coupon.id)).reservedCount, 0);

    // The money arrives anyway: the order stays cancelled and a refund is raised.
    const res = await verify(o.c, o);
    assert.equal(res.status, 200);
    assert.equal(res.body.late, true);
    assert.equal((await models.Order.findById(o.order.id)).status, 'cancelled');
    assert.equal((await models.Listing.findById(o.l._id)).stock, 10, 'stock is not taken again');
    const pay = await models.Payment.findById(o.pay._id);
    assert.equal(pay.status, 'refund_pending');
    const refund = await models.Refund.findOne({ orderId: o.order.id });
    assert.deepEqual([refund.kind, refund.amountPaise], ['late_payment', pay.amountPaise]);
    assert.equal(refund.status, 'processing', 'the refund was started with the provider');
    assert.equal(calls.refunds.length, 1);
    assert.equal(await ledgerCount(), 0);
    assert.equal((await models.Notification.countDocuments({ type: 'refund.pending' })) >= 2, true);
    await expireStaleOrders();
    assert.equal(
      await models.Refund.countDocuments({ orderId: o.order.id }),
      1,
      'no duplicate refund',
    );
  });

  it('a capture arriving after a failure is refunded, not fulfilled', async () => {
    const o = await onlineOrder();
    await webhook('failed', failed(o));
    const res = await webhook('captured', captured(o, 'pay_after_fail'));
    assert.equal(res.body.result, 'applied');
    assert.equal((await models.Payment.findById(o.pay._id)).status, 'refund_pending');
    assert.equal((await models.Order.findById(o.order.id)).status, 'payment_failed');
    assert.equal(await models.Refund.countDocuments({ kind: 'late_payment' }), 1);
    assert.equal((await models.Listing.findById(o.l._id)).soldCount, 0);
  });

  it('a buyer can cancel an unpaid online order themselves', async () => {
    const o = await onlineOrder();
    const res = await o.c.post(`/api/orders/${o.order.id}/cancel`, {});
    assert.equal(res.body.order.status, 'cancelled');
    assert.equal((await models.Payment.findById(o.pay._id)).status, 'cancelled');
    assert.equal((await models.Listing.findById(o.l._id)).stock, 10);
    assert.equal(await models.Refund.countDocuments(), 0, 'nothing was paid, nothing to refund');
  });
});

describe('refunds are only complete when the provider confirms', () => {
  async function paidThenCancelled() {
    const o = await onlineOrder({ qty: 2 });
    await verify(o.c, o);
    const res = await o.c.post(`/api/orders/${o.order.id}/cancel`, { reason: 'Changed my mind' });
    assert.equal(res.status, 200);
    return o;
  }

  it('cancelling a paid order starts a refund that stays pending until the webhook confirms it', async () => {
    const o = await paidThenCancelled();
    const refund = await models.Refund.findOne({ orderId: o.order.id });
    assert.equal(refund.amountPaise, 80000);
    assert.equal(refund.status, 'processing');
    assert.match(refund.providerRefundId, /^rfnd_/);
    assert.equal(calls.refunds[0].amountPaise, 80000);
    assert.equal(calls.refunds[0].paymentId, 'pay_test_0001');
    const mid = (await o.c.get(`/api/orders/${o.order.id}`)).body.order;
    assert.equal(mid.paymentStatus, 'refund_pending', 'not reported as refunded yet');
    assert.equal(mid.totals.refundedPaise, 0);
    assert.equal(mid.refunds[0].status, 'processing');
    for (const [kind, refundKind] of [
      ['sale', 'refund_sale'],
      ['commission', 'refund_commission'],
      ['vendor_share', 'refund_vendor_share'],
    ]) {
      assert.equal(
        (
          await models.LedgerEntry.aggregate([
            { $match: { kind: { $in: [kind, refundKind] } } },
            { $group: { _id: null, n: { $sum: '$amountPaise' } } },
          ])
        )[0].n,
        0,
        kind,
      );
    }

    // Wrong amount: ignored.
    const bad = {
      event: 'refund.processed',
      payload: {
        refund: {
          entity: { id: refund.providerRefundId, payment_id: 'pay_test_0001', amount: 100 },
        },
      },
    };
    assert.equal((await webhook('r', bad)).body.result, 'ignored');
    assert.equal((await models.Refund.findById(refund._id)).status, 'processing');

    const good = {
      event: 'refund.processed',
      payload: {
        refund: {
          entity: { id: refund.providerRefundId, payment_id: 'pay_test_0001', amount: 80000 },
        },
      },
    };
    assert.equal((await webhook('r', good, { id: 'evt_refund_1' })).body.result, 'applied');
    const done = await models.Refund.findById(refund._id);
    assert.equal(done.status, 'processed');
    assert.ok(done.processedAt);
    const order = (await o.c.get(`/api/orders/${o.order.id}`)).body.order;
    assert.deepEqual(
      [order.paymentStatus, order.totals.refundedPaise, order.payment.status],
      ['refunded', 80000, 'refunded'],
    );
    assert.equal(await models.Notification.countDocuments({ type: 'refund.processed' }), 1);
    await webhook('r', good, { id: 'evt_refund_1' });
    assert.equal(
      (await models.Order.findById(o.order.id)).refundedPaise,
      80000,
      'a replayed event cannot refund twice',
    );
  });

  it('a refund the provider rejects is marked failed, flagged to admins, and can be retried', async () => {
    removeFakeProvider();
    let fail = true;
    installFakeProvider({
      refund: async () => {
        if (fail) throw new Error('insufficient balance');
        return { id: 'rfnd_retry_ok' };
      },
    });
    const a = await admin(); // someone must exist to be alerted
    const o = await paidThenCancelled();
    const refund = await models.Refund.findOne({ orderId: o.order.id });
    assert.equal(refund.status, 'failed');
    assert.match(refund.failureReason, /insufficient balance/);
    assert.equal(await models.Notification.countDocuments({ type: 'refund.failed' }), 1);
    assert.equal((await models.Order.findById(o.order.id)).paymentStatus, 'refund_pending');
    fail = false;
    const retry = await a.post(`/api/admin/refunds/${refund._id}/retry`);
    assert.equal(retry.body.refund.status, 'processing');
    assert.equal(retry.body.refund.providerRefundId, 'rfnd_retry_ok');
    assert.equal((await a.post(`/api/admin/refunds/${refund._id}/retry`)).status, 409);
    assert.equal((await a.get('/api/admin/refunds')).body.items[0].status, 'processing');
    const buyer = newClient(app);
    await buyer.login(o.u.email, PASSWORD);
    assert.equal((await buyer.post(`/api/admin/refunds/${refund._id}/retry`)).status, 403);
    assert.equal(
      await initiateRefund(refund._id),
      null,
      'cannot start an already running refund again',
    );
  });

  it('without provider keys a refund stays pending for an administrator to deal with', async () => {
    const o = await onlineOrder();
    await verify(o.c, o);
    removeFakeProvider();
    await o.c.post(`/api/orders/${o.order.id}/cancel`, {});
    const refund = await models.Refund.findOne({ orderId: o.order.id });
    assert.equal(refund.status, 'pending');
    assert.equal((await models.Order.findById(o.order.id)).paymentStatus, 'refund_pending');
  });
});

describe('ledger and admin reporting data', () => {
  it('the ledger reconciles with the order for a paid, discounted, multi-quantity order', async () => {
    const a = await admin();
    const {
      body: { coupon },
    } = await a.post('/api/admin/coupons', {
      discountType: 'percent',
      value: 20,
      validFrom: new Date(Date.now() - day).toISOString(),
      validTo: new Date(Date.now() + day).toISOString(),
      appliesToAll: true,
    });
    const o = await onlineOrder({ qty: 3, price: 33333, coupon: coupon.code });
    await verify(o.c, o);
    const order = await models.Order.findById(o.order.id);
    const net = order.subtotalPaise - order.discountPaise;
    const get = async (kind) =>
      (
        await models.LedgerEntry.aggregate([
          { $match: { orderId: order._id, kind } },
          { $group: { _id: null, n: { $sum: '$amountPaise' } } },
        ])
      )[0]?.n ?? 0;
    assert.equal(await get('sale'), net);
    assert.equal((await get('commission')) + (await get('vendor_share')), net);
    assert.equal(order.discountPaise, Math.floor((99999 * 20) / 100));
    assert.equal(order.totalPaise, net + order.shippingPaise);
    const view = (await a.get(`/api/admin/orders/${order.id}`)).body.order;
    assert.equal(view.ledger[0].commissionPercent, 10);
    const payments = (await a.get('/api/admin/payments')).body.items[0];
    assert.deepEqual(
      [payments.status, payments.verified, payments.verifiedVia],
      ['successful', true, 'checkout_signature'],
    );
  });

  it('public config reports which payment methods are really available', async () => {
    assert.deepEqual((await newClient(app).get('/api/catalog/config')).body.paymentMethods, [
      'cod',
      'online',
    ]);
    removeFakeProvider();
    assert.deepEqual((await newClient(app).get('/api/catalog/config')).body.paymentMethods, [
      'cod',
    ]);
  });
});

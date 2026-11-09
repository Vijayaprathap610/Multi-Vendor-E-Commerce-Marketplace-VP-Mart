import crypto from 'node:crypto';
import mongoose from 'mongoose';
import env from '../config/env.js';
import Address from '../models/Address.js';
import Cart from '../models/Cart.js';
import Category from '../models/Category.js';
import Listing from '../models/Listing.js';
import Order from '../models/Order.js';
import OrderItem from '../models/OrderItem.js';
import Payment from '../models/Payment.js';
import Refund from '../models/Refund.js';
import Shipment from '../models/Shipment.js';
import VendorProfile from '../models/VendorProfile.js';
import { AppError, notFound } from '../utils/AppError.js';
import { roundDiv } from '../utils/money.js';
import { catalogChanged, cartCache } from './cache.js';
import { redeem, release, reserve } from './couponService.js';
import { estimateDelivery } from './deliveryEstimate.js';
import { accrueOrder, reverseItems, reverseShipping } from './ledgerService.js';
import { notify, notifyAdmins } from './notificationService.js';
import { getProvider, onlineEnabled } from './paymentProvider.js';
import { getCartItems, priceItems } from './cartService.js';
import { getCommissionPercent } from './settingsService.js';

const CANCELLABLE_SHIPMENT = ['pending_payment', 'confirmed', 'packing', 'packed'];
const stamp = (status, by, note) => ({ status, at: new Date(), by, note });

const newOrderNumber = () =>
  `VPM-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

// ------------------------------------------------------------------ preview / checkout input

async function resolveItems(user, { buyNow, couponCode }) {
  if (buyNow)
    return {
      items: [{ listingId: buyNow.listingId, quantity: buyNow.quantity }],
      couponCode,
      fromCart: false,
    };
  const cart = await Cart.findOne({ userId: user._id }).select('couponCode').lean();
  return {
    items: await getCartItems(user._id),
    couponCode: couponCode ?? cart?.couponCode,
    fromCart: true,
  };
}

// Works out, per vendor shipment, whether the seller can deliver to this PIN code and when.
async function planShipments(priced, pincode) {
  const vendorIds = [...new Set(priced.lines.filter((l) => l.available).map((l) => l.vendor.id))];
  const [profiles, cats] = await Promise.all([
    VendorProfile.find({ userId: { $in: vendorIds } }).lean(),
    Category.find({
      _id: { $in: priced.lines.filter((l) => l.available).map((l) => l.categoryId) },
    }).lean(),
  ]);
  const profileOf = new Map(profiles.map((p) => [String(p.userId), p]));
  const catOf = new Map(cats.map((c) => [String(c._id), c]));
  const blocked = {};
  const estimates = new Map();
  for (const l of priced.lines.filter((x) => x.available)) {
    const est = estimateDelivery({
      vendor: profileOf.get(l.vendor.id),
      category: catOf.get(l.categoryId),
      pincode,
    });
    if (!est.serviceable) {
      blocked[l.title] = est.message || 'Cannot be delivered to this PIN code';
      continue;
    }
    const cur = estimates.get(l.vendor.id);
    // A shipment arrives when its slowest item arrives.
    estimates.set(
      l.vendor.id,
      cur
        ? {
            ...cur,
            dispatchDate: cur.dispatchDate > est.dispatchDate ? cur.dispatchDate : est.dispatchDate,
            earliest: cur.earliest > est.earliest ? cur.earliest : est.earliest,
            latest: cur.latest > est.latest ? cur.latest : est.latest,
          }
        : {
            dispatchDate: est.dispatchDate,
            earliest: est.earliest,
            latest: est.latest,
            zone: est.zone,
          },
    );
  }
  return { estimates, blocked };
}

export async function preview(user, { addressId, couponCode, buyNow }) {
  const src = await resolveItems(user, { buyNow, couponCode });
  if (!src.items.length) {
    return {
      lines: [],
      shipments: [],
      totals: { subtotalPaise: 0, discountPaise: 0, shippingPaise: 0, taxPaise: 0, totalPaise: 0 },
      hasIssues: false,
      coupon: null,
      delivery: null,
      empty: true,
      onlinePaymentAvailable: onlineEnabled(),
    };
  }
  const { _couponDoc, ...priced } = await priceItems(src.items, {
    couponCode: src.couponCode,
    buyerId: user._id,
  });
  let delivery = null;
  if (addressId) {
    const address = await Address.findOne({ _id: addressId, userId: user._id }).lean();
    if (!address) throw notFound('Address not found');
    const plan = await planShipments(priced, address.pincode);
    delivery = {
      pincode: address.pincode,
      blocked: plan.blocked,
      shipments: Object.fromEntries(plan.estimates),
    };
    priced.shipments = priced.shipments.map((s) => ({
      ...s,
      estimate: plan.estimates.get(s.vendorId) ?? null,
    }));
  }
  return { ...priced, delivery, onlinePaymentAvailable: onlineEnabled() };
}

// ------------------------------------------------------------------ create order

export async function createOrder(user, { addressId, paymentMethod, couponCode, buyNow }) {
  const address = await Address.findOne({ _id: addressId, userId: user._id }).lean();
  if (!address)
    throw new AppError(422, 'BAD_ADDRESS', 'Choose a delivery address', {
      addressId: 'Choose a delivery address',
    });
  const src = await resolveItems(user, { buyNow, couponCode });
  if (!src.items.length) throw new AppError(409, 'CART_EMPTY', 'Your cart is empty');
  if (paymentMethod === 'online' && !onlineEnabled())
    throw new AppError(
      409,
      'ONLINE_PAYMENT_UNAVAILABLE',
      'Online payment is not available right now. Choose Cash on Delivery.',
    );

  // 1) Price everything on the server.
  const priced = await priceItems(src.items, { couponCode: src.couponCode, buyerId: user._id });
  if (priced.hasIssues) {
    throw new AppError(
      409,
      'CART_ISSUES',
      'Some items are no longer available in the requested quantity',
      Object.fromEntries(
        priced.lines.filter((l) => !l.available).map((l) => [l.title, l.issues.join(', ')]),
      ),
    );
  }
  if (src.couponCode && !priced.coupon?.valid)
    throw new AppError(422, 'COUPON_INVALID', priced.coupon?.message ?? 'Invalid coupon', {
      couponCode: priced.coupon?.message,
    });
  const couponDoc = priced.coupon?.valid ? priced._couponDoc : null;

  // 2) Can every seller deliver to this address?
  const plan = await planShipments(priced, address.pincode);
  if (Object.keys(plan.blocked).length)
    throw new AppError(
      409,
      'UNDELIVERABLE',
      'Some items cannot be delivered to this address',
      plan.blocked,
    );

  const rate = await getCommissionPercent();
  const isCod = paymentMethod === 'cod';
  const now = new Date();
  const lineStatus = isCod ? 'confirmed' : 'pending_payment';

  // 3) One transaction: reserve stock (conditionally, so it can never oversell), then write the order.
  const result = await mongoose.connection.transaction(async (session) => {
    for (const l of priced.lines) {
      const r = await Listing.updateOne(
        { _id: l.listingId, isPublic: true, manualOutOfStock: false, stock: { $gte: l.quantity } },
        { $inc: { stock: -l.quantity, ...(isCod ? { soldCount: l.quantity } : {}) } },
        { session },
      );
      if (!r.modifiedCount)
        throw new AppError(409, 'INSUFFICIENT_STOCK', `“${l.title}” just went out of stock`, {
          [l.title]: 'OUT_OF_STOCK',
        });
    }

    const [order] = await Order.create(
      [
        {
          buyerId: user._id,
          orderNumber: newOrderNumber(),
          status: isCod ? 'confirmed' : 'pending_payment',
          paymentMethod,
          paymentStatus: isCod ? 'cod_pending' : 'pending',
          address: {
            name: address.name,
            phone: address.phone,
            line1: address.line1,
            line2: address.line2,
            city: address.city,
            state: address.state,
            pincode: address.pincode,
          },
          couponCode: couponDoc?.code,
          couponId: couponDoc?._id,
          subtotalPaise: priced.totals.subtotalPaise,
          discountPaise: priced.totals.discountPaise,
          shippingPaise: priced.totals.shippingPaise,
          taxPaise: priced.totals.taxPaise,
          taxMode: priced.totals.taxMode,
          totalPaise: priced.totals.totalPaise,
          fromCart: src.fromCart,
          placedAt: now,
          ...(isCod
            ? { confirmedAt: now }
            : { expiresAt: new Date(now.getTime() + env.PENDING_PAYMENT_TTL_MIN * 60000) }),
        },
      ],
      { session },
    );

    const shipments = await Shipment.create(
      priced.shipments.map((s) => ({
        orderId: order._id,
        buyerId: user._id,
        vendorId: s.vendorId,
        vendorName: s.vendorName,
        status: lineStatus,
        subtotalPaise: s.subtotalPaise,
        discountPaise: s.discountPaise,
        shippingPaise: s.shippingPaise,
        estimate: plan.estimates.get(s.vendorId),
        timeline: [stamp(lineStatus, user._id)],
      })),
      { session, ordered: true },
    );
    const shipmentOf = new Map(shipments.map((s) => [String(s.vendorId), s._id]));

    await OrderItem.create(
      priced.lines.map((l) => {
        // Commission is charged on the item's net amount (after discount), excluding shipping.
        const commissionPaise = roundDiv(l.netPaise * rate, 100);
        return {
          orderId: order._id,
          shipmentId: shipmentOf.get(l.vendor.id),
          buyerId: user._id,
          vendorId: l.vendor.id,
          listingId: l.listingId,
          productId: l.productId,
          categoryId: l.categoryId,
          title: l.title,
          sku: l.sku,
          variant: l.variant,
          image: l.image,
          unitPaise: l.unitPaise,
          quantity: l.quantity,
          linePaise: l.linePaise,
          discountPaise: l.discountPaise,
          netPaise: l.netPaise,
          gstPercent: l.gstPercent,
          taxPaise: l.taxPaise,
          commissionPercent: rate,
          commissionPaise,
          vendorSharePaise: l.netPaise - commissionPaise,
        };
      }),
      { session, ordered: true },
    );

    const [payment] = await Payment.create(
      [
        {
          orderId: order._id,
          buyerId: user._id,
          method: paymentMethod,
          provider: isCod ? 'none' : 'razorpay',
          amountPaise: order.totalPaise,
          status: isCod ? 'cod_pending' : 'pending',
        },
      ],
      { session },
    );

    if (couponDoc) {
      await reserve({
        coupon: couponDoc,
        buyerId: user._id,
        orderId: order._id,
        discountPaise: priced.totals.discountPaise,
        session,
      });
      if (isCod) await redeem(order._id, { session });
    }
    if (isCod) await accrueOrder(order._id, { session });
    return { order, payment };
  });

  await catalogChanged();
  const { order, payment } = result;

  if (isCod) {
    if (src.fromCart) await clearCartAfterOrder(user._id);
    await announceConfirmed(order);
    return {
      order: await getOrderView(order._id, user._id),
      payment: { method: 'cod', status: 'cod_pending' },
    };
  }

  // Online: create the provider order. If that fails, undo everything (stock, coupon) right away.
  try {
    const provider = getProvider();
    const po = await provider.createOrder({
      amountPaise: order.totalPaise,
      receipt: order.orderNumber,
      notes: { orderId: String(order._id) },
    });
    await Payment.updateOne({ _id: payment._id }, { providerOrderId: po.id });
    return {
      order: await getOrderView(order._id, user._id),
      payment: {
        method: 'online',
        status: 'pending',
        razorpay: {
          keyId: provider.keyId,
          orderId: po.id,
          amountPaise: order.totalPaise,
          currency: 'INR',
          name: 'VP Mart',
          description: `Order ${order.orderNumber}`,
          isDummy: !!provider.isDummy,
        },
      },
    };
  } catch (err) {
    await cancelUnpaid(order._id, {
      reason: 'Could not start the online payment',
      paymentStatus: 'failed',
      orderStatus: 'payment_failed',
    });
    throw new AppError(
      502,
      'PAYMENT_PROVIDER_ERROR',
      'We could not start the online payment. Nothing was charged. Please try again.',
      { cause: err?.message?.slice(0, 120) },
    );
  }
}

async function clearCartAfterOrder(userId) {
  await Cart.deleteOne({ userId });
  await cartCache.del(userId);
}

// ------------------------------------------------------------------ confirmation / notifications

export async function announceConfirmed(order) {
  const shipments = await Shipment.find({ orderId: order._id }).lean();
  await notify(order.buyerId, {
    type: 'order.confirmed',
    title: `Order ${order.orderNumber} confirmed`,
    body: 'Thanks for your order. Each seller will pack and dispatch their items.',
    data: { orderId: String(order._id) },
  });
  for (const s of shipments)
    await notify(s.vendorId, {
      type: 'order.new',
      title: `New order ${order.orderNumber}`,
      body: 'Pack the items to get them picked up.',
      data: { orderId: String(order._id), shipmentId: String(s._id) },
    });
}

// Cancels an unpaid (or failed-payment) order and gives back stock and coupon use.
export async function cancelUnpaid(
  orderId,
  { reason, paymentStatus = 'cancelled', orderStatus = 'cancelled' },
) {
  const done = await mongoose.connection.transaction(async (session) => {
    const order = await Order.findOneAndUpdate(
      { _id: orderId, status: 'pending_payment' },
      { status: orderStatus, paymentStatus, cancelReason: reason, $unset: { expiresAt: '' } },
      { session, returnDocument: 'after' },
    );
    if (!order) return false;
    const items = await OrderItem.find({ orderId }).session(session).lean();
    for (const it of items)
      await Listing.updateOne({ _id: it.listingId }, { $inc: { stock: it.quantity } }, { session });
    await OrderItem.updateMany({ orderId }, { status: 'cancelled' }, { session });
    await Shipment.updateMany(
      { orderId },
      { status: 'cancelled', $push: { timeline: stamp('cancelled', null, reason) } },
      { session },
    );
    await Payment.updateOne(
      { orderId, status: { $in: ['pending'] } },
      { status: paymentStatus, failureReason: reason },
      { session },
    );
    await release(orderId, { session });
    return true;
  });
  if (done) {
    await catalogChanged();
    const order = await Order.findById(orderId).lean();
    await notify(order.buyerId, {
      type: 'order.cancelled',
      title: `Order ${order.orderNumber} was not placed`,
      body: reason,
      data: { orderId: String(orderId) },
    });
  }
  return done;
}

// Cancels unpaid online orders whose payment window passed. Safe to run repeatedly.
export async function expireStaleOrders(now = new Date()) {
  const stale = await Order.find({ status: 'pending_payment', expiresAt: { $lt: now } })
    .select('_id')
    .limit(200)
    .lean();
  let n = 0;
  for (const o of stale)
    if (await cancelUnpaid(o._id, { reason: 'Payment was not completed in time' })) n++;
  return n;
}

// ------------------------------------------------------------------ buyer cancellation

export async function cancelOrder(user, orderId, reason = 'Cancelled by buyer') {
  const order = await Order.findOne({ _id: orderId, buyerId: user._id });
  if (!order) throw notFound('Order not found');
  if (!['pending_payment', 'confirmed'].includes(order.status))
    throw new AppError(409, 'NOT_CANCELLABLE', 'This order can no longer be cancelled');
  const shipments = await Shipment.find({ orderId }).lean();
  if (shipments.some((s) => !CANCELLABLE_SHIPMENT.includes(s.status))) {
    throw new AppError(
      409,
      'TOO_LATE',
      'A seller has already handed this order to delivery. You can request a return after it arrives.',
    );
  }
  if (order.status === 'pending_payment') {
    await cancelUnpaid(orderId, { reason });
    return getOrderView(orderId, user._id);
  }

  const refund = await mongoose.connection.transaction(async (session) => {
    const o = await Order.findOneAndUpdate(
      { _id: orderId, status: 'confirmed' },
      { status: 'cancelled', cancelReason: reason },
      { session, returnDocument: 'after' },
    );
    if (!o) throw new AppError(409, 'NOT_CANCELLABLE', 'This order can no longer be cancelled');
    const items = await OrderItem.find({ orderId, status: 'active' }).session(session).lean();
    for (const it of items)
      await Listing.updateOne(
        { _id: it.listingId },
        { $inc: { stock: it.quantity, soldCount: -it.quantity } },
        { session },
      );
    await OrderItem.updateMany({ orderId }, { status: 'cancelled' }, { session });
    await Shipment.updateMany(
      { orderId },
      { status: 'cancelled', $push: { timeline: stamp('cancelled', user._id, reason) } },
      { session },
    );
    await release(orderId, { session });
    await reverseItems(items, { session });
    await reverseShipping(shipments, { session });
    const pay = await Payment.findOne({ orderId }).session(session);
    if (pay.method === 'online' && pay.status === 'successful') {
      await Payment.updateOne({ _id: pay._id }, { status: 'refund_pending' }, { session });
      await Order.updateOne({ _id: orderId }, { paymentStatus: 'refund_pending' }, { session });
      const [r] = await Refund.create(
        [
          {
            orderId,
            paymentId: pay._id,
            buyerId: user._id,
            amountPaise: o.totalPaise,
            kind: 'cancellation',
            reason,
            key: `cancel:${orderId}`,
          },
        ],
        { session },
      );
      return r;
    }
    await Payment.updateOne({ _id: pay._id }, { status: 'cancelled' }, { session });
    await Order.updateOne({ _id: orderId }, { paymentStatus: 'cancelled' }, { session });
    return null;
  });

  await catalogChanged();
  await notify(user._id, {
    type: 'order.cancelled',
    title: `Order ${order.orderNumber} cancelled`,
    body: refund
      ? 'Your refund is pending and will show as complete only after the payment provider confirms it.'
      : 'No payment was taken.',
    data: { orderId: String(orderId) },
  });
  for (const s of shipments)
    await notify(s.vendorId, {
      type: 'order.cancelled',
      title: `Order ${order.orderNumber} was cancelled`,
      body: 'Do not dispatch these items.',
      data: { orderId: String(orderId) },
    });
  if (refund) {
    await notifyAdmins({
      type: 'refund.pending',
      title: `Refund pending for ${order.orderNumber}`,
      body: 'A paid order was cancelled.',
      data: { refundId: String(refund._id) },
    });
    // Best effort: start the refund with the provider; its status stays "pending" until confirmed.
    const { initiateRefund } = await import('./paymentService.js');
    await initiateRefund(refund._id).catch(() => {});
  }
  return getOrderView(orderId, user._id);
}

// ------------------------------------------------------------------ views

const itemView = (i) => ({
  id: String(i._id),
  listingId: String(i.listingId),
  title: i.title,
  variant: i.variant,
  image: i.image,
  unitPaise: i.unitPaise,
  quantity: i.quantity,
  linePaise: i.linePaise,
  discountPaise: i.discountPaise,
  netPaise: i.netPaise,
  status: i.status,
});

export async function getOrderView(orderId, buyerId) {
  const order = await Order.findOne({ _id: orderId, ...(buyerId ? { buyerId } : {}) }).lean();
  if (!order) throw notFound('Order not found');
  const [items, shipments, payment, refunds] = await Promise.all([
    OrderItem.find({ orderId }).lean(),
    Shipment.find({ orderId }).sort({ createdAt: 1 }).lean(),
    Payment.findOne({ orderId }).lean(),
    Refund.find({ orderId }).lean(),
  ]);
  return {
    id: String(order._id),
    orderNumber: order.orderNumber,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    address: order.address,
    couponCode: order.couponCode,
    totals: {
      subtotalPaise: order.subtotalPaise,
      discountPaise: order.discountPaise,
      shippingPaise: order.shippingPaise,
      taxPaise: order.taxPaise,
      taxMode: order.taxMode,
      totalPaise: order.totalPaise,
      refundedPaise: order.refundedPaise,
    },
    placedAt: order.placedAt,
    expiresAt: order.expiresAt,
    cancelReason: order.cancelReason,
    cancellable:
      ['pending_payment', 'confirmed'].includes(order.status) &&
      shipments.every((s) => CANCELLABLE_SHIPMENT.includes(s.status)),
    payment: payment
      ? {
          method: payment.method,
          status: payment.status,
          providerPaymentId: payment.providerPaymentId,
          refundedPaise: payment.refundedPaise,
        }
      : null,
    refunds: refunds.map((r) => ({
      id: String(r._id),
      amountPaise: r.amountPaise,
      status: r.status,
      kind: r.kind,
    })),
    shipments: shipments.map((s) => ({
      id: String(s._id),
      vendorName: s.vendorName,
      status: s.status,
      shippingPaise: s.shippingPaise,
      estimate: s.estimate,
      timeline: s.timeline.map((t) => ({ status: t.status, at: t.at, note: t.note })),
      items: items.filter((i) => String(i.shipmentId) === String(s._id)).map(itemView),
    })),
  };
}

export async function listOrders(buyerId, { page = 1, limit = 20 } = {}) {
  const [rows, total] = await Promise.all([
    Order.find({ buyerId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Order.countDocuments({ buyerId }),
  ]);
  const ids = rows.map((o) => o._id);
  const [items, shipments] = await Promise.all([
    OrderItem.find({ orderId: { $in: ids } }).lean(),
    Shipment.find({ orderId: { $in: ids } }).lean(),
  ]);
  return {
    items: rows.map((o) => ({
      id: String(o._id),
      orderNumber: o.orderNumber,
      status: o.status,
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      totalPaise: o.totalPaise,
      placedAt: o.placedAt,
      itemCount: items
        .filter((i) => String(i.orderId) === String(o._id))
        .reduce((n, i) => n + i.quantity, 0),
      thumbnails: items
        .filter((i) => String(i.orderId) === String(o._id) && i.image)
        .slice(0, 3)
        .map((i) => i.image),
      shipments: shipments
        .filter((s) => String(s.orderId) === String(o._id))
        .map((s) => ({
          id: String(s._id),
          vendorName: s.vendorName,
          status: s.status,
          estimate: s.estimate,
        })),
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}

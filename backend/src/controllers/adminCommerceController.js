import Coupon from '../models/Coupon.js';
import CouponRedemption from '../models/CouponRedemption.js';
import Order from '../models/Order.js';
import OrderItem from '../models/OrderItem.js';
import Payment from '../models/Payment.js';
import Product from '../models/Product.js';
import Refund from '../models/Refund.js';
import Shipment from '../models/Shipment.js';
import User from '../models/User.js';
import { AppError, notFound } from '../utils/AppError.js';
import { escapeRegex } from '../utils/text.js';
import { audit } from '../services/auditService.js';
import { catalogChanged } from '../services/cache.js';
import { describe, generateCode } from '../services/couponService.js';
import { getOrderView } from '../services/orderService.js';
import { initiateRefund } from '../services/paymentService.js';
import { getCommissionPercent, setCommissionPercent } from '../services/settingsService.js';

// ---------------- coupons ----------------
async function assertTargets(body) {
  if (body.productIds?.length) {
    const n = await Product.countDocuments({ _id: { $in: body.productIds } });
    if (n !== new Set(body.productIds).size)
      throw new AppError(422, 'BAD_PRODUCTS', 'One or more products do not exist', {
        productIds: 'Unknown product',
      });
  }
  if (body.eligibility?.mode === 'buyers') {
    const n = await User.countDocuments({ _id: { $in: body.eligibility.buyerIds }, role: 'buyer' });
    if (n !== new Set(body.eligibility.buyerIds).size)
      throw new AppError(422, 'BAD_BUYERS', 'One or more selected buyers do not exist', {
        eligibility: 'Unknown buyer',
      });
  }
}

async function createCoupon(req, res, forcedProducts) {
  const b = { ...req.valid.body };
  if (forcedProducts) b.productIds = [...new Set([...forcedProducts, ...b.productIds])];
  await assertTargets(b);
  let prefix = b.codePrefix;
  if (!prefix && b.productIds.length)
    prefix = (await Product.findById(b.productIds[0]).select('name').lean())?.name?.split(' ')[0];
  const code = await generateCode(
    prefix,
    b.discountType === 'percent' ? b.value : Math.round(b.value / 100),
  );
  const { codePrefix: _p, ...rest } = b;
  const c = await Coupon.create({ ...rest, code, createdBy: req.user._id });
  await audit(req, 'coupon.created', { target: { type: 'Coupon', id: c._id }, metadata: { code } });
  res.status(201).json({ coupon: await couponView(c) });
}
export const createGeneralCoupon = (req, res) => createCoupon(req, res);
export const createProductCoupon = (req, res) => createCoupon(req, res, [req.valid.params.id]);

async function couponView(c, stats) {
  const products = c.productIds?.length
    ? await Product.find({ _id: { $in: c.productIds } })
        .select('name')
        .lean()
    : [];
  const now = new Date();
  return {
    id: String(c._id),
    code: c.code,
    title: c.title,
    description: describe(c),
    discountType: c.discountType,
    value: c.value,
    minPurchasePaise: c.minPurchasePaise,
    maxDiscountPaise: c.maxDiscountPaise,
    validFrom: c.validFrom,
    validTo: c.validTo,
    isActive: c.isActive,
    isPublic: c.isPublic,
    appliesToAll: c.appliesToAll,
    products: products.map((p) => ({ id: String(p._id), name: p.name })),
    eligibility: {
      mode: c.eligibility?.mode,
      buyerCount: c.eligibility?.buyerIds?.length ?? 0,
      buyerIds: c.eligibility?.buyerIds?.map(String),
    },
    usageLimit: c.usageLimit,
    perBuyerLimit: c.perBuyerLimit,
    usedCount: c.usedCount,
    reservedCount: c.reservedCount,
    remaining: c.usageLimit ? Math.max(0, c.usageLimit - c.usedCount - c.reservedCount) : null,
    state: !c.isActive
      ? 'inactive'
      : now < c.validFrom
        ? 'scheduled'
        : now > c.validTo
          ? 'expired'
          : 'active',
    ...(stats ?? {}),
  };
}

export async function listCoupons(req, res) {
  const { status, q, productId, page, limit } = req.valid.query;
  const now = new Date();
  const filter = {};
  if (status === 'active')
    Object.assign(filter, { isActive: true, validFrom: { $lte: now }, validTo: { $gte: now } });
  if (status === 'inactive') filter.isActive = false;
  if (status === 'expired') filter.validTo = { $lt: now };
  if (status === 'scheduled') Object.assign(filter, { isActive: true, validFrom: { $gt: now } });
  if (productId) filter.productIds = productId;
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ code: rx }, { title: rx }];
  }
  const [rows, total] = await Promise.all([
    Coupon.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Coupon.countDocuments(filter),
  ]);
  const sums = await CouponRedemption.aggregate([
    { $match: { couponId: { $in: rows.map((r) => r._id) }, status: 'redeemed' } },
    { $group: { _id: '$couponId', discountPaise: { $sum: '$discountPaise' } } },
  ]);
  const sumOf = new Map(sums.map((s) => [String(s._id), s.discountPaise]));
  res.json({
    items: await Promise.all(
      rows.map((c) => couponView(c, { totalDiscountPaise: sumOf.get(String(c._id)) ?? 0 })),
    ),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}

export async function updateCoupon(req, res) {
  const c = await Coupon.findById(req.valid.params.id);
  if (!c) throw notFound('Coupon not found');
  const b = req.valid.body;
  const inUse = c.usedCount + c.reservedCount;
  if (b.value !== undefined && b.value !== c.value && inUse > 0)
    throw new AppError(
      409,
      'COUPON_IN_USE',
      'The discount value cannot change after the coupon has been used. Create a new coupon instead.',
    );
  if (b.usageLimit != null && b.usageLimit < inUse)
    throw new AppError(
      422,
      'LIMIT_TOO_LOW',
      `The limit cannot be below the ${inUse} uses already counted`,
      { usageLimit: `Minimum ${inUse}` },
    );
  if (c.discountType === 'percent' && b.value > 100)
    throw new AppError(422, 'BAD_VALUE', 'A percentage cannot exceed 100', { value: 'Max 100' });
  await assertTargets(b);
  for (const k of [
    'title',
    'value',
    'minPurchasePaise',
    'validFrom',
    'validTo',
    'productIds',
    'appliesToAll',
    'eligibility',
    'perBuyerLimit',
    'isPublic',
    'isActive',
  ])
    if (b[k] !== undefined) c[k] = b[k];
  if (b.maxDiscountPaise !== undefined) c.maxDiscountPaise = b.maxDiscountPaise ?? undefined;
  if (b.usageLimit !== undefined) c.usageLimit = b.usageLimit ?? undefined;
  if (c.validTo <= c.validFrom)
    throw new AppError(422, 'BAD_DATES', 'End must be after start', {
      validTo: 'End must be after start',
    });
  if (!c.appliesToAll && !c.productIds.length)
    throw new AppError(
      422,
      'NO_PRODUCTS',
      'Choose at least one product, or apply to all products',
      { productIds: 'Required' },
    );
  await c.save();
  await audit(req, 'coupon.updated', {
    target: { type: 'Coupon', id: c._id },
    metadata: { fields: Object.keys(b) },
  });
  res.json({ coupon: await couponView(c) });
}

export async function couponRedemptions(req, res) {
  const c = await Coupon.findById(req.valid.params.id).lean();
  if (!c) throw notFound('Coupon not found');
  const rows = await CouponRedemption.find({ couponId: c._id })
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();
  const orders = await Order.find({ _id: { $in: rows.map((r) => r.orderId) } })
    .select('orderNumber')
    .lean();
  const num = new Map(orders.map((o) => [String(o._id), o.orderNumber]));
  res.json({
    items: rows.map((r) => ({
      id: String(r._id),
      orderNumber: num.get(String(r.orderId)),
      discountPaise: r.discountPaise,
      status: r.status,
      at: r.createdAt,
    })),
  });
}

// ---------------- orders, payments, refunds, settings (admin views) ----------------
export async function adminOrders(req, res) {
  const { status, paymentStatus, q, page, limit } = req.valid.query;
  const filter = {};
  if (status) filter.status = status;
  if (paymentStatus) filter.paymentStatus = paymentStatus;
  if (q) filter.orderNumber = new RegExp(escapeRegex(q), 'i');
  const [rows, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
  ]);
  const buyers = await User.find({ _id: { $in: rows.map((o) => o.buyerId) } })
    .select('name')
    .lean();
  const nameOf = new Map(buyers.map((b) => [String(b._id), b.name]));
  res.json({
    items: rows.map((o) => ({
      id: String(o._id),
      orderNumber: o.orderNumber,
      buyer: nameOf.get(String(o.buyerId)),
      city: o.address?.city,
      status: o.status,
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      totalPaise: o.totalPaise,
      discountPaise: o.discountPaise,
      placedAt: o.placedAt,
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}

export async function adminOrder(req, res) {
  const order = await getOrderView(req.valid.params.id);
  // Admins do not need the buyer's street address or phone number.
  const { line1: _l, line2: _l2, phone: _p, ...safeAddress } = order.address;
  const items = await OrderItem.find({ orderId: order.id }).lean();
  res.json({
    order: {
      ...order,
      address: safeAddress,
      ledger: items.map((i) => ({
        title: i.title,
        vendorId: String(i.vendorId),
        netPaise: i.netPaise,
        commissionPaise: i.commissionPaise,
        vendorSharePaise: i.vendorSharePaise,
        commissionPercent: i.commissionPercent,
      })),
    },
  });
}

export async function adminPayments(req, res) {
  const { status, page, limit } = req.valid.query;
  const filter = status ? { status } : {};
  const [rows, total] = await Promise.all([
    Payment.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Payment.countDocuments(filter),
  ]);
  const orders = await Order.find({ _id: { $in: rows.map((p) => p.orderId) } })
    .select('orderNumber')
    .lean();
  const num = new Map(orders.map((o) => [String(o._id), o.orderNumber]));
  res.json({
    items: rows.map((p) => ({
      id: String(p._id),
      orderNumber: num.get(String(p.orderId)),
      method: p.method,
      provider: p.provider,
      providerOrderId: p.providerOrderId,
      providerPaymentId: p.providerPaymentId,
      amountPaise: p.amountPaise,
      status: p.status,
      verifiedVia: p.verifiedVia,
      verified: !!p.verifiedAt,
      failureReason: p.failureReason,
      refundedPaise: p.refundedPaise,
      createdAt: p.createdAt,
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}

export async function adminRefunds(_req, res) {
  const rows = await Refund.find().sort({ createdAt: -1 }).limit(100).lean();
  const orders = await Order.find({ _id: { $in: rows.map((r) => r.orderId) } })
    .select('orderNumber')
    .lean();
  const num = new Map(orders.map((o) => [String(o._id), o.orderNumber]));
  res.json({
    items: rows.map((r) => ({
      id: String(r._id),
      orderNumber: num.get(String(r.orderId)),
      amountPaise: r.amountPaise,
      kind: r.kind,
      status: r.status,
      reason: r.reason,
      failureReason: r.failureReason,
      createdAt: r.createdAt,
    })),
  });
}
export async function retryRefund(req, res) {
  const r = await Refund.findById(req.valid.params.id);
  if (!r) throw notFound('Refund not found');
  if (!['pending', 'failed'].includes(r.status))
    throw new AppError(409, 'NOT_RETRYABLE', `This refund is ${r.status}`);
  await initiateRefund(r._id);
  await audit(req, 'refund.retried', { target: { type: 'Refund', id: r._id } });
  res.json({ refund: await Refund.findById(r._id).lean() });
}

export async function getSettings(_req, res) {
  res.json({ commissionPercent: await getCommissionPercent() });
}
export async function putSettings(req, res) {
  const v = await setCommissionPercent(req.valid.body.commissionPercent, req.user._id);
  await audit(req, 'settings.commission_changed', { metadata: { commissionPercent: v } });
  await catalogChanged();
  res.json({ commissionPercent: v });
}

export async function shipmentsOverview(_req, res) {
  const rows = await Shipment.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
  res.json({ byStatus: Object.fromEntries(rows.map((r) => [r._id, r.n])) });
}

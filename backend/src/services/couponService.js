import crypto from 'node:crypto';
import Coupon from '../models/Coupon.js';
import CouponRedemption from '../models/CouponRedemption.js';
import Order from '../models/Order.js';
import { AppError } from '../utils/AppError.js';
import { roundDiv } from '../utils/money.js';
import { slugify } from '../utils/text.js';

export const REASONS = {
  NOT_FOUND: 'This coupon code is not valid',
  INACTIVE: 'This coupon is not active',
  NOT_STARTED: 'This coupon is not valid yet',
  EXPIRED: 'This coupon has expired',
  EXHAUSTED: 'This coupon has been fully redeemed',
  PER_BUYER_LIMIT: 'You have already used this coupon',
  NOT_ELIGIBLE_BUYER: 'This coupon is not available for your account',
  NOT_NEW_BUYER: 'This coupon is only for first-time buyers',
  NO_ELIGIBLE_ITEMS: 'This coupon does not apply to the items in your cart',
  MIN_PURCHASE: 'Your eligible items do not reach the minimum purchase for this coupon',
};

const fail = (reason, extra = {}) => ({ valid: false, reason, message: REASONS[reason], ...extra });

export const normaliseCode = (c) =>
  String(c ?? '')
    .trim()
    .toUpperCase();

// Generates a unique, readable code on the server, e.g. SHIRT60X4K.
export async function generateCode(prefixSource, value) {
  const base =
    slugify(prefixSource || 'VP')
      .replace(/-/g, '')
      .toUpperCase()
      .slice(0, 6) || 'VP';
  for (let i = 0; i < 10; i++) {
    const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
    const code = `${base}${value}${suffix}`;
    if (!(await Coupon.exists({ code }))) return code;
  }
  return `${base}${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

// Spreads a discount over eligible lines in proportion to their value, in whole paise, giving any
// rounding remainder to the last line so the allocations always add up exactly.
export function allocate(discountPaise, eligibleLines) {
  const total = eligibleLines.reduce((s, l) => s + l.linePaise, 0);
  const out = new Map();
  let left = discountPaise;
  eligibleLines.forEach((l, i) => {
    const share =
      i === eligibleLines.length - 1
        ? left
        : Math.min(left, Math.floor((discountPaise * l.linePaise) / total));
    out.set(l.listingId, share);
    left -= share;
  });
  return out;
}

export function computeDiscount(coupon, eligibleSubtotal) {
  let d =
    coupon.discountType === 'percent'
      ? Math.floor((eligibleSubtotal * coupon.value) / 100)
      : coupon.value;
  if (coupon.maxDiscountPaise) d = Math.min(d, coupon.maxDiscountPaise);
  return Math.max(0, Math.min(d, eligibleSubtotal));
}

// Pure eligibility + amount check against already-priced, available cart lines.
// Applying a coupon (this function) never changes any counters; reservation does.
export async function evaluate(coupon, { buyerId, lines, now = new Date() }) {
  if (!coupon) return fail('NOT_FOUND');
  if (!coupon.isActive) return fail('INACTIVE');
  if (now < coupon.validFrom) return fail('NOT_STARTED');
  if (now > coupon.validTo) return fail('EXPIRED');
  if (coupon.usageLimit && coupon.usedCount + coupon.reservedCount >= coupon.usageLimit)
    return fail('EXHAUSTED');

  const { mode, buyerIds } = coupon.eligibility ?? { mode: 'all' };
  if (mode === 'buyers' && !(buyerIds ?? []).some((b) => String(b) === String(buyerId)))
    return fail('NOT_ELIGIBLE_BUYER');
  if (
    mode === 'new_buyers' &&
    (await Order.exists({
      buyerId,
      status: { $in: ['confirmed', 'completed', 'pending_payment'] },
    }))
  )
    return fail('NOT_NEW_BUYER');
  if (coupon.perBuyerLimit) {
    const used = await CouponRedemption.countDocuments({
      couponId: coupon._id,
      buyerId,
      status: { $in: ['reserved', 'redeemed'] },
    });
    if (used >= coupon.perBuyerLimit) return fail('PER_BUYER_LIMIT');
  }

  const productSet = new Set((coupon.productIds ?? []).map(String));
  const eligible = lines.filter(
    (l) => l.available && (coupon.appliesToAll || productSet.has(String(l.productId))),
  );
  if (!eligible.length) return fail('NO_ELIGIBLE_ITEMS');
  const eligibleSubtotal = eligible.reduce((s, l) => s + l.linePaise, 0);
  if (eligibleSubtotal < (coupon.minPurchasePaise ?? 0))
    return fail('MIN_PURCHASE', { minPurchasePaise: coupon.minPurchasePaise });

  const discountPaise = computeDiscount(coupon, eligibleSubtotal);
  if (discountPaise <= 0) return fail('NO_ELIGIBLE_ITEMS');
  return {
    valid: true,
    code: coupon.code,
    couponId: String(coupon._id),
    discountPaise,
    eligibleSubtotalPaise: eligibleSubtotal,
    allocations: allocate(discountPaise, eligible),
  };
}

export const findByCode = (code) => Coupon.findOne({ code: normaliseCode(code) });

// ---- reservation lifecycle (used by checkout and payment) ----
// reserve: atomically holds one use. The usage-limit check is part of the update itself, so
// two buyers racing for the last use cannot both get it.
export async function reserve({ coupon, buyerId, orderId, discountPaise, session }) {
  const cond = { _id: coupon._id, isActive: true };
  if (coupon.usageLimit)
    cond.$expr = { $lt: [{ $add: ['$usedCount', '$reservedCount'] }, '$usageLimit'] };
  const upd = await Coupon.updateOne(cond, { $inc: { reservedCount: 1 } }, { session });
  if (!upd.modifiedCount) throw new AppError(409, 'COUPON_EXHAUSTED', REASONS.EXHAUSTED);
  await CouponRedemption.create(
    [
      {
        couponId: coupon._id,
        code: coupon.code,
        buyerId,
        orderId,
        discountPaise,
        status: 'reserved',
      },
    ],
    { session },
  );
}

// redeem: reserved -> redeemed, exactly once (the status filter makes it idempotent).
export async function redeem(orderId, { session } = {}) {
  const r = await CouponRedemption.findOneAndUpdate(
    { orderId, status: 'reserved' },
    { status: 'redeemed' },
    { session, returnDocument: 'after' },
  );
  if (r)
    await Coupon.updateOne(
      { _id: r.couponId },
      { $inc: { reservedCount: -1, usedCount: 1 } },
      { session },
    );
  return !!r;
}

// release: gives the use back (payment failed, order cancelled or expired).
export async function release(orderId, { session } = {}) {
  const r = await CouponRedemption.findOneAndUpdate(
    { orderId, status: { $in: ['reserved', 'redeemed'] } },
    { status: 'released' },
    { session, returnDocument: 'before' },
  );
  if (!r) return false;
  const inc = r.status === 'redeemed' ? { usedCount: -1 } : { reservedCount: -1 };
  await Coupon.updateOne({ _id: r.couponId }, { $inc: inc }, { session });
  return true;
}

export const describe = (c) =>
  (c.discountType === 'percent'
    ? `${c.value}% off`
    : `₹${(c.value / 100).toFixed(c.value % 100 ? 2 : 0)} off`) +
  (c.maxDiscountPaise && c.discountType === 'percent'
    ? ` (up to ₹${c.maxDiscountPaise / 100})`
    : '');
export { roundDiv };

import env from '../config/env.js';
import Cart from '../models/Cart.js';
import Listing from '../models/Listing.js';
import VendorProfile from '../models/VendorProfile.js';
import { AppError } from '../utils/AppError.js';
import { roundDiv } from '../utils/money.js';
import { cartCache } from './cache.js';
import { evaluate, findByCode, normaliseCode } from './couponService.js';

export const MAX_QTY = 20;

// Server-side pricing. Prices, stock, shipping, tax and coupon discounts come ONLY from the
// database; the browser sends listing ids, quantities and an optional coupon code, nothing else.
// Everything is integer paise.
export async function priceItems(items, { taxMode = env.TAX_MODE, couponCode, buyerId } = {}) {
  const ids = items.map((i) => i.listingId);
  const listings = await Listing.find({ _id: { $in: ids } }).lean();
  const byId = new Map(listings.map((l) => [String(l._id), l]));
  const vendorIds = [...new Set(listings.map((l) => String(l.vendorId)))];
  const profiles = await VendorProfile.find({ userId: { $in: vendorIds } }).lean();
  const profileOf = new Map(profiles.map((p) => [String(p.userId), p]));

  const lines = items.map((it) => {
    const l = byId.get(String(it.listingId));
    const issues = [];
    if (!l || !l.isPublic) {
      return {
        listingId: String(it.listingId),
        quantity: it.quantity,
        available: false,
        issues: ['UNAVAILABLE'],
        title: l?.title ?? 'Unavailable product',
      };
    }
    const stock = l.manualOutOfStock ? 0 : l.stock;
    let available = true;
    if (stock <= 0) {
      available = false;
      issues.push('OUT_OF_STOCK');
    } else if (it.quantity > stock) {
      available = false;
      issues.push('INSUFFICIENT_STOCK');
    }
    return {
      listingId: String(l._id),
      productId: String(l.productId),
      categoryId: String(l.subcategoryId ?? l.categoryId),
      title: l.title,
      slug: l.slug,
      sku: l.sku,
      variant: l.variant,
      image: l.images?.[0]?.thumbUrl ?? null,
      vendor: { id: String(l.vendorId), name: l.vendorName },
      unitPaise: l.pricePaise,
      mrpPaise: l.mrpPaise,
      quantity: it.quantity,
      linePaise: l.pricePaise * it.quantity,
      discountPaise: 0,
      gstPercent: l.gstPercent ?? 18,
      available,
      maxQuantity: Math.min(MAX_QTY, stock),
      issues,
    };
  });

  // Coupon: evaluated against the available lines. Applying changes no counters.
  let coupon = null;
  let couponDoc = null;
  if (couponCode) {
    couponDoc = await findByCode(couponCode);
    const ev = await evaluate(couponDoc, { buyerId, lines: lines.filter((l) => l.available) });
    if (ev.valid) {
      coupon = {
        code: ev.code,
        valid: true,
        discountPaise: ev.discountPaise,
        title: couponDoc.title,
      };
      for (const l of lines) l.discountPaise = ev.allocations.get(l.listingId) ?? 0;
    } else {
      coupon = {
        code: normaliseCode(couponCode),
        valid: false,
        reason: ev.reason,
        message: ev.message,
      };
    }
  }

  for (const l of lines) {
    if (!l.available) continue;
    l.netPaise = l.linePaise - l.discountPaise;
    // Tax is computed on the discounted amount.
    l.taxPaise =
      taxMode === 'inclusive'
        ? roundDiv(l.netPaise * l.gstPercent, 100 + l.gstPercent)
        : roundDiv(l.netPaise * l.gstPercent, 100);
  }

  const payable = lines.filter((l) => l.available);
  const subtotalPaise = payable.reduce((s, l) => s + l.linePaise, 0);
  const discountPaise = payable.reduce((s, l) => s + l.discountPaise, 0);
  const taxPaise = payable.reduce((s, l) => s + l.taxPaise, 0);

  // One shipping charge per vendor shipment; free shipping is judged on the discounted value.
  const groups = new Map();
  for (const l of payable) {
    const g = groups.get(l.vendor.id) ?? {
      vendorId: l.vendor.id,
      vendorName: l.vendor.name,
      subtotalPaise: 0,
      discountPaise: 0,
    };
    g.subtotalPaise += l.linePaise;
    g.discountPaise += l.discountPaise;
    groups.set(l.vendor.id, g);
  }
  const shipments = [...groups.values()].map((g) => {
    const d = profileOf.get(g.vendorId)?.delivery ?? {};
    const net = g.subtotalPaise - g.discountPaise;
    const free = d.freeShippingAbovePaise != null && net >= d.freeShippingAbovePaise;
    return {
      ...g,
      netPaise: net,
      shippingPaise: free ? 0 : (d.shippingChargePaise ?? 0),
      freeShipping: free,
    };
  });
  const shippingPaise = shipments.reduce((s, g) => s + g.shippingPaise, 0);
  const totalPaise =
    subtotalPaise - discountPaise + shippingPaise + (taxMode === 'exclusive' ? taxPaise : 0);

  return {
    lines,
    shipments,
    coupon,
    totals: { subtotalPaise, discountPaise, shippingPaise, taxPaise, taxMode, totalPaise },
    hasIssues: lines.some((l) => !l.available),
    _couponDoc: couponDoc,
  };
}

export const getCartItems = (userId) => cartItems(userId);

async function cartItems(userId) {
  const cached = await cartCache.get(userId);
  if (cached) return cached;
  const cart = await Cart.findOne({ userId }).lean();
  const items = (cart?.items ?? []).map((i) => ({
    listingId: String(i.listingId),
    quantity: i.quantity,
  }));
  await cartCache.set(userId, items);
  return items;
}

export async function getCart(userId) {
  const cart = await Cart.findOne({ userId }).select('couponCode').lean();
  const { _couponDoc, ...priced } = await priceItems(await cartItems(userId), {
    couponCode: cart?.couponCode,
    buyerId: userId,
  });
  return priced;
}

// Applying a coupon only stores the code on the cart. It is re-validated on every read and again
// at checkout, and nothing is counted as used until an order is confirmed.
export async function applyCoupon(userId, code) {
  const items = await cartItems(userId);
  if (!items.length)
    throw new AppError(409, 'CART_EMPTY', 'Add items to your cart before applying a coupon');
  const { coupon } = await priceItems(items, { couponCode: code, buyerId: userId });
  if (!coupon.valid)
    throw new AppError(422, 'COUPON_INVALID', coupon.message, {
      code: coupon.message,
      reason: coupon.reason,
    });
  await Cart.updateOne({ userId }, { couponCode: coupon.code });
  return getCart(userId);
}

export async function removeCoupon(userId) {
  await Cart.updateOne({ userId }, { $unset: { couponCode: '' } });
  return getCart(userId);
}

async function sync(userId) {
  await cartCache.del(userId);
  return cartItems(userId);
}

async function requireBuyable(listingId, quantity) {
  const l = await Listing.findById(listingId).lean();
  if (!l || !l.isPublic)
    throw new AppError(404, 'LISTING_UNAVAILABLE', 'This product is not available');
  const stock = l.manualOutOfStock ? 0 : l.stock;
  if (stock <= 0) throw new AppError(409, 'OUT_OF_STOCK', 'This product is out of stock');
  if (quantity > Math.min(stock, MAX_QTY)) {
    throw new AppError(409, 'INSUFFICIENT_STOCK', `Only ${Math.min(stock, MAX_QTY)} available`, {
      quantity: `Only ${Math.min(stock, MAX_QTY)} available`,
    });
  }
  return l;
}

export async function addItem(userId, listingId, quantity) {
  const l = await requireBuyable(listingId, quantity);
  const cap = Math.min(l.manualOutOfStock ? 0 : l.stock, MAX_QTY);
  // 1) Add the line if it is not there yet (never creates a duplicate line, even concurrently).
  const pushed = await Cart.updateOne(
    { userId, 'items.listingId': { $ne: listingId } },
    { $push: { items: { listingId, quantity } } },
  );
  if (!pushed.modifiedCount) {
    if (!(await Cart.exists({ userId }))) {
      try {
        await Cart.create({ userId, items: [{ listingId, quantity }] });
      } catch (err) {
        if (err?.code !== 11000) throw err;
        return addItem(userId, listingId, quantity);
      }
    } else {
      // 2) Increment atomically only while the result stays within stock: no lost updates.
      const inc = await Cart.updateOne(
        { userId, items: { $elemMatch: { listingId, quantity: { $lte: cap - quantity } } } },
        { $inc: { 'items.$.quantity': quantity } },
      );
      if (!inc.modifiedCount) {
        throw new AppError(409, 'INSUFFICIENT_STOCK', `Only ${cap} available`, {
          quantity: `Only ${cap} available`,
        });
      }
    }
  }
  return sync(userId);
}

export async function setQuantity(userId, listingId, quantity) {
  await requireBuyable(listingId, quantity);
  const res = await Cart.updateOne(
    { userId, 'items.listingId': listingId },
    { $set: { 'items.$.quantity': quantity } },
  );
  if (!res.matchedCount) throw new AppError(404, 'NOT_IN_CART', 'Item is not in your cart');
  return sync(userId);
}

export async function removeItem(userId, listingId) {
  await Cart.updateOne({ userId }, { $pull: { items: { listingId } } });
  return sync(userId);
}

export async function clearCart(userId) {
  await Cart.deleteOne({ userId });
  await cartCache.del(userId);
}

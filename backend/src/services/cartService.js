import env from '../config/env.js';
import Cart from '../models/Cart.js';
import Listing from '../models/Listing.js';
import VendorProfile from '../models/VendorProfile.js';
import { AppError } from '../utils/AppError.js';
import { roundDiv } from '../utils/money.js';
import { cartCache } from './cache.js';

export const MAX_QTY = 20;

// Server-side pricing. Prices, stock, shipping and tax come ONLY from the database; the
// browser sends listing ids and quantities and nothing else. Everything is integer paise.
export async function priceItems(items, { taxMode = env.TAX_MODE } = {}) {
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
    const linePaise = l.pricePaise * it.quantity;
    const rate = l.gstPercent ?? 18;
    const taxPaise =
      taxMode === 'inclusive'
        ? roundDiv(linePaise * rate, 100 + rate)
        : roundDiv(linePaise * rate, 100);
    return {
      listingId: String(l._id),
      title: l.title,
      slug: l.slug,
      image: l.images?.[0]?.thumbUrl ?? null,
      vendor: { id: String(l.vendorId), name: l.vendorName },
      unitPaise: l.pricePaise,
      mrpPaise: l.mrpPaise,
      quantity: it.quantity,
      linePaise,
      gstPercent: rate,
      taxPaise,
      available,
      maxQuantity: Math.min(MAX_QTY, stock),
      issues,
    };
  });

  const payable = lines.filter((l) => l.available);
  const subtotalPaise = payable.reduce((s, l) => s + l.linePaise, 0);
  const taxPaise = payable.reduce((s, l) => s + l.taxPaise, 0);

  // One shipping charge per vendor shipment, with free shipping above the vendor's threshold.
  const groups = new Map();
  for (const l of payable) {
    const g = groups.get(l.vendor.id) ?? {
      vendorId: l.vendor.id,
      vendorName: l.vendor.name,
      subtotalPaise: 0,
    };
    g.subtotalPaise += l.linePaise;
    groups.set(l.vendor.id, g);
  }
  const shipments = [...groups.values()].map((g) => {
    const d = profileOf.get(g.vendorId)?.delivery ?? {};
    const free = d.freeShippingAbovePaise != null && g.subtotalPaise >= d.freeShippingAbovePaise;
    return { ...g, shippingPaise: free ? 0 : (d.shippingChargePaise ?? 0), freeShipping: free };
  });
  const shippingPaise = shipments.reduce((s, g) => s + g.shippingPaise, 0);
  const discountPaise = 0;
  const totalPaise =
    subtotalPaise - discountPaise + shippingPaise + (taxMode === 'exclusive' ? taxPaise : 0);

  return {
    lines,
    shipments,
    totals: {
      subtotalPaise,
      discountPaise,
      shippingPaise,
      taxPaise,
      taxMode,
      totalPaise,
    },
    hasIssues: lines.some((l) => !l.available),
  };
}

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
  return priceItems(await cartItems(userId));
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

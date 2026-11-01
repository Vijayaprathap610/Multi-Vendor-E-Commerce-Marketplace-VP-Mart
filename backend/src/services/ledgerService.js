import LedgerEntry from '../models/LedgerEntry.js';
import OrderItem from '../models/OrderItem.js';
import Shipment from '../models/Shipment.js';

// Inserts ledger rows idempotently: a duplicate key (retry, duplicate webhook) is ignored, so
// totals can never be counted twice.
async function insertOnce(rows, session) {
  for (const row of rows) {
    try {
      await LedgerEntry.create([row], session ? { session } : undefined);
    } catch (err) {
      if (err?.code !== 11000) throw err;
    }
  }
}

// Called once an order is confirmed (COD placed, or online payment verified).
export async function accrueOrder(orderId, { session } = {}) {
  const [items, shipments] = await Promise.all([
    OrderItem.find({ orderId })
      .session(session ?? null)
      .lean(),
    Shipment.find({ orderId })
      .session(session ?? null)
      .lean(),
  ]);
  const rows = [];
  for (const it of items) {
    const base = { orderId, orderItemId: it._id, vendorId: it.vendorId };
    rows.push({ ...base, key: `sale:${it._id}`, kind: 'sale', amountPaise: it.netPaise });
    rows.push({
      ...base,
      key: `commission:${it._id}`,
      kind: 'commission',
      amountPaise: it.commissionPaise,
    });
    rows.push({
      ...base,
      key: `vendor_share:${it._id}`,
      kind: 'vendor_share',
      amountPaise: it.vendorSharePaise,
    });
  }
  for (const sh of shipments) {
    if (sh.shippingPaise > 0)
      rows.push({
        orderId,
        vendorId: sh.vendorId,
        key: `shipping:${sh._id}`,
        kind: 'shipping',
        amountPaise: sh.shippingPaise,
      });
  }
  await insertOnce(rows, session);
  return rows.length;
}

// Reverses the ledger for cancelled items (full line), keyed per item so it happens once.
export async function reverseItems(items, { session, tag = 'cancel' } = {}) {
  const rows = [];
  for (const it of items) {
    const base = {
      orderId: it.orderId,
      orderItemId: it._id,
      vendorId: it.vendorId,
      status: 'accrued',
    };
    rows.push({
      ...base,
      key: `refund_sale:${tag}:${it._id}`,
      kind: 'refund_sale',
      amountPaise: -it.netPaise,
    });
    rows.push({
      ...base,
      key: `refund_commission:${tag}:${it._id}`,
      kind: 'refund_commission',
      amountPaise: -it.commissionPaise,
    });
    rows.push({
      ...base,
      key: `refund_vendor_share:${tag}:${it._id}`,
      kind: 'refund_vendor_share',
      amountPaise: -it.vendorSharePaise,
    });
  }
  await insertOnce(rows, session);
}

export async function reverseShipping(shipments, { session, tag = 'cancel' } = {}) {
  const rows = shipments
    .filter((s) => s.shippingPaise > 0)
    .map((s) => ({
      orderId: s.orderId,
      vendorId: s.vendorId,
      key: `refund_shipping:${tag}:${s._id}`,
      kind: 'refund_shipping',
      amountPaise: -s.shippingPaise,
    }));
  await insertOnce(rows, session);
}

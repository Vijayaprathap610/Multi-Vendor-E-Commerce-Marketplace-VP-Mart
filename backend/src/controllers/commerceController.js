import Address from '../models/Address.js';
import Notification from '../models/Notification.js';
import { AppError, notFound } from '../utils/AppError.js';
import { audit } from '../services/auditService.js';
import * as orders from '../services/orderService.js';
import * as payments from '../services/paymentService.js';
import { view as notificationView } from '../services/notificationService.js';
import * as cart from '../services/cartService.js';

// ---- addresses (own only) ----
const addressView = (a) => ({
  id: String(a._id),
  label: a.label,
  name: a.name,
  phone: a.phone,
  line1: a.line1,
  line2: a.line2,
  city: a.city,
  state: a.state,
  pincode: a.pincode,
  isDefault: a.isDefault,
});
const MAX_ADDRESSES = 10;

export async function listAddresses(req, res) {
  const items = await Address.find({ userId: req.user._id })
    .sort({ isDefault: -1, createdAt: -1 })
    .lean();
  res.json({ items: items.map(addressView) });
}
export async function createAddress(req, res) {
  if ((await Address.countDocuments({ userId: req.user._id })) >= MAX_ADDRESSES)
    throw new AppError(409, 'TOO_MANY_ADDRESSES', `You can save up to ${MAX_ADDRESSES} addresses`);
  const first = !(await Address.exists({ userId: req.user._id }));
  const makeDefault = first || req.valid.body.isDefault;
  if (makeDefault) await Address.updateMany({ userId: req.user._id }, { isDefault: false });
  const a = await Address.create({
    ...req.valid.body,
    userId: req.user._id,
    isDefault: !!makeDefault,
  });
  res.status(201).json({ address: addressView(a) });
}
export async function updateAddress(req, res) {
  const a = await Address.findOne({ _id: req.valid.params.id, userId: req.user._id });
  if (!a) throw notFound('Address not found');
  if (req.valid.body.isDefault)
    await Address.updateMany({ userId: req.user._id, _id: { $ne: a._id } }, { isDefault: false });
  Object.assign(a, req.valid.body);
  await a.save();
  res.json({ address: addressView(a) });
}
export async function deleteAddress(req, res) {
  const a = await Address.findOneAndDelete({ _id: req.valid.params.id, userId: req.user._id });
  if (!a) throw notFound('Address not found');
  // Orders keep their own copy of the address, so deleting it never changes order history.
  if (a.isDefault)
    await Address.findOneAndUpdate(
      { userId: req.user._id },
      { isDefault: true },
      { sort: { createdAt: -1 } },
    );
  res.json({ ok: true });
}

// ---- cart coupon ----
export async function applyCartCoupon(req, res) {
  res.json(await cart.applyCoupon(req.user._id, req.valid.body.code));
}
export async function removeCartCoupon(req, res) {
  res.json(await cart.removeCoupon(req.user._id));
}

// ---- checkout and orders ----
export const previewCheckout = async (req, res) =>
  res.json(await orders.preview(req.user, req.valid.body));
export async function checkout(req, res) {
  const r = await orders.createOrder(req.user, req.valid.body);
  await audit(req, 'order.placed', {
    target: { type: 'Order', id: r.order.id },
    metadata: { method: req.valid.body.paymentMethod, totalPaise: r.order.totals.totalPaise },
  });
  res.status(201).json(r);
}
export const listMyOrders = async (req, res) =>
  res.json(await orders.listOrders(req.user._id, req.valid.query));
export const getMyOrder = async (req, res) =>
  res.json({ order: await orders.getOrderView(req.valid.params.id, req.user._id) });
export async function cancelMyOrder(req, res) {
  const order = await orders.cancelOrder(req.user, req.valid.params.id, req.valid.body.reason);
  await audit(req, 'order.cancelled', { target: { type: 'Order', id: order.id } });
  res.json({ order });
}

// ---- payments ----
export const verifyPayment = async (req, res) => {
  const { orderId, razorpayPaymentId, razorpaySignature } = req.valid.body;
  const r = await payments.verifyCheckout(req.user, {
    orderId,
    providerPaymentId: razorpayPaymentId,
    signature: razorpaySignature,
  });
  res.json({ ...r, order: await orders.getOrderView(orderId, req.user._id) });
};
export const paymentFailed = async (req, res) => {
  const r = await payments.reportCheckoutFailure(req.user, req.valid.body);
  res.json(r);
};
// Provider webhook: authenticated by signature over the raw body, exempt from CSRF/cookies.
export async function razorpayWebhook(req, res) {
  const r = await payments.handleWebhook({
    rawBody: req.rawBody?.toString('utf8'),
    signature: req.get('x-razorpay-signature'),
    eventId: req.get('x-razorpay-event-id'),
  });
  res.json({ ok: true, ...r });
}

// ---- notifications ----
export async function listNotifications(req, res) {
  const { unread, limit } = req.valid.query;
  const filter = { userId: req.user._id, ...(unread ? { readAt: { $exists: false } } : {}) };
  const [items, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
    Notification.countDocuments({ userId: req.user._id, readAt: { $exists: false } }),
  ]);
  res.json({ items: items.map(notificationView), unreadCount });
}
export async function markNotificationsRead(req, res) {
  const { ids, all } = req.valid.body;
  const r = await Notification.updateMany(
    { userId: req.user._id, readAt: { $exists: false }, ...(all ? {} : { _id: { $in: ids } }) },
    { readAt: new Date() },
  );
  res.json({ updated: r.modifiedCount });
}

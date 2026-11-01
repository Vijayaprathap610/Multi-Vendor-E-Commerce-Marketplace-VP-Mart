import mongoose from 'mongoose';
import Cart from '../models/Cart.js';
import Listing from '../models/Listing.js';
import Order from '../models/Order.js';
import OrderItem from '../models/OrderItem.js';
import Payment from '../models/Payment.js';
import Refund from '../models/Refund.js';
import Shipment from '../models/Shipment.js';
import WebhookEvent from '../models/WebhookEvent.js';
import { AppError, notFound } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { catalogChanged, cartCache } from './cache.js';
import { redeem } from './couponService.js';
import { accrueOrder } from './ledgerService.js';
import { notify, notifyAdmins } from './notificationService.js';
import { announceConfirmed, cancelUnpaid } from './orderService.js';
import { getProvider, verifyCheckoutSignature, verifyWebhookSignature } from './paymentProvider.js';

const stamp = (status, note) => ({ status, at: new Date(), note });

// ---------------------------------------------------------------- confirm (idempotent)
// Moves a pending payment to successful EXACTLY once, then confirms the order. Both the checkout
// signature path and the webhook path call this, so whichever arrives first wins and the other
// is a harmless no-op. A browser "success" callback alone never gets here.
export async function confirmPayment({ providerOrderId, providerPaymentId, via, amountPaise }) {
  const payment = await Payment.findOne({ providerOrderId });
  if (!payment) throw notFound('Payment not found');
  if (amountPaise != null && amountPaise !== payment.amountPaise) {
    await notifyAdmins({
      type: 'payment.mismatch',
      title: 'Payment amount mismatch',
      body: `Order payment ${payment._id} reported ${amountPaise} but expected ${payment.amountPaise}`,
      data: { paymentId: String(payment._id) },
    });
    logger.error(
      { paymentId: payment._id, amountPaise },
      'payment amount mismatch; not confirming',
    );
    return { applied: false, reason: 'AMOUNT_MISMATCH' };
  }

  const outcome = await mongoose.connection.transaction(async (session) => {
    const flipped = await Payment.findOneAndUpdate(
      { _id: payment._id, status: 'pending' },
      { status: 'successful', providerPaymentId, verifiedAt: new Date(), verifiedVia: via },
      { session, returnDocument: 'after' },
    );
    if (flipped) {
      const order = await Order.findOneAndUpdate(
        { _id: payment.orderId, status: 'pending_payment' },
        {
          status: 'confirmed',
          paymentStatus: 'successful',
          confirmedAt: new Date(),
          $unset: { expiresAt: '' },
        },
        { session, returnDocument: 'after' },
      );
      if (order) {
        const items = await OrderItem.find({ orderId: order._id }).session(session).lean();
        for (const it of items)
          await Listing.updateOne(
            { _id: it.listingId },
            { $inc: { soldCount: it.quantity } },
            { session },
          );
        await Shipment.updateMany(
          { orderId: order._id },
          { status: 'confirmed', $push: { timeline: stamp('confirmed', 'Payment verified') } },
          { session },
        );
        await redeem(order._id, { session });
        await accrueOrder(order._id, { session });
        return { kind: 'confirmed', order };
      }
      // Paid, but the order was already cancelled or expired: the money must go back.
      await Payment.updateOne({ _id: payment._id }, { status: 'refund_pending' }, { session });
      const late = await Order.findByIdAndUpdate(
        payment.orderId,
        { paymentStatus: 'refund_pending' },
        { session, returnDocument: 'after' },
      );
      const [refund] = await Refund.create(
        [
          {
            orderId: payment.orderId,
            paymentId: payment._id,
            buyerId: payment.buyerId,
            amountPaise: payment.amountPaise,
            kind: 'late_payment',
            reason: 'Payment arrived after the order was cancelled or expired',
            key: `late:${payment._id}`,
          },
        ],
        { session },
      );
      return { kind: 'late', order: late, refund };
    }
    // A capture that arrives for a payment we had already marked failed/cancelled: also refund.
    const lateFail = await Payment.findOneAndUpdate(
      { _id: payment._id, status: { $in: ['failed', 'cancelled'] } },
      { status: 'refund_pending', providerPaymentId, verifiedAt: new Date(), verifiedVia: via },
      { session, returnDocument: 'after' },
    );
    if (lateFail) {
      await Order.updateOne(
        { _id: payment.orderId },
        { paymentStatus: 'refund_pending' },
        { session },
      );
      const [refund] = await Refund.create(
        [
          {
            orderId: payment.orderId,
            paymentId: payment._id,
            buyerId: payment.buyerId,
            amountPaise: payment.amountPaise,
            kind: 'late_payment',
            reason: 'Payment captured after it had been marked failed',
            key: `late:${payment._id}`,
          },
        ],
        { session },
      );
      return {
        kind: 'late',
        order: await Order.findById(payment.orderId).session(session),
        refund,
      };
    }
    return { kind: 'noop' };
  });

  if (outcome.kind === 'confirmed') {
    await catalogChanged();
    if (outcome.order.fromCart) {
      await Cart.deleteOne({ userId: outcome.order.buyerId });
      await cartCache.del(outcome.order.buyerId);
    }
    await announceConfirmed(outcome.order);
    await notify(outcome.order.buyerId, {
      type: 'payment.success',
      title: 'Payment received',
      body: `We received your payment for order ${outcome.order.orderNumber}.`,
      data: { orderId: String(outcome.order._id) },
    });
    return { applied: true, order: outcome.order };
  }
  if (outcome.kind === 'late') {
    await notifyAdmins({
      type: 'refund.pending',
      title: 'Late payment needs a refund',
      body: `Order ${outcome.order?.orderNumber} was paid after it was cancelled.`,
      data: { refundId: String(outcome.refund._id) },
    });
    await notify(payment.buyerId, {
      type: 'refund.pending',
      title: 'Payment will be refunded',
      body: 'Your order had already been cancelled, so this payment will be refunded.',
      data: { orderId: String(payment.orderId) },
    });
    await initiateRefund(outcome.refund._id).catch(() => {});
    return { applied: true, late: true };
  }
  return { applied: false, reason: 'ALREADY_PROCESSED' };
}

// ---------------------------------------------------------------- checkout callback (signature)
export async function verifyCheckout(user, { orderId, providerPaymentId, signature }) {
  const payment = await Payment.findOne({ orderId, buyerId: user._id });
  if (!payment || payment.method !== 'online') throw notFound('Payment not found');
  const provider = getProvider();
  const ok = verifyCheckoutSignature(provider, {
    providerOrderId: payment.providerOrderId,
    providerPaymentId,
    signature,
  });
  if (!ok) {
    logger.warn({ orderId }, 'checkout signature verification failed');
    throw new AppError(
      400,
      'BAD_PAYMENT_SIGNATURE',
      'We could not verify this payment. If money was deducted it will be refunded automatically.',
    );
  }
  const r = await confirmPayment({
    providerOrderId: payment.providerOrderId,
    providerPaymentId,
    via: 'checkout_signature',
  });
  return { verified: true, ...r };
}

// ---------------------------------------------------------------- failures
export async function failPayment({ providerOrderId, reason, buyerId }) {
  const payment = await Payment.findOne({ providerOrderId, ...(buyerId ? { buyerId } : {}) });
  if (!payment) throw notFound('Payment not found');
  const moved = await Payment.findOneAndUpdate(
    { _id: payment._id, status: 'pending' },
    { status: 'failed', failureReason: reason?.slice(0, 300) },
    { returnDocument: 'after' },
  );
  if (!moved) return { applied: false };
  await cancelUnpaid(payment.orderId, {
    reason: reason || 'Payment failed',
    paymentStatus: 'failed',
    orderStatus: 'payment_failed',
  });
  const order = await Order.findById(payment.orderId).lean();
  await notifyAdmins({
    type: 'payment.failed',
    title: `Payment failed for ${order?.orderNumber}`,
    body: reason?.slice(0, 200),
    data: { orderId: String(payment.orderId) },
  });
  return { applied: true };
}

export async function reportCheckoutFailure(user, { orderId, reason }) {
  const payment = await Payment.findOne({ orderId, buyerId: user._id });
  if (!payment || payment.method !== 'online') throw notFound('Payment not found');
  return failPayment({
    providerOrderId: payment.providerOrderId,
    reason: reason || 'Payment was not completed',
    buyerId: user._id,
  });
}

// ---------------------------------------------------------------- webhooks
// Authenticated by HMAC over the RAW body. Each provider event id is processed once; replays
// return 200 without doing anything.
export async function handleWebhook({ rawBody, signature, eventId }) {
  const provider = getProvider();
  if (!provider || !verifyWebhookSignature(provider, rawBody, signature))
    throw new AppError(401, 'BAD_WEBHOOK_SIGNATURE', 'Invalid webhook signature');
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    throw new AppError(400, 'BAD_JSON', 'Malformed webhook body');
  }
  const id =
    eventId ||
    `${event.event}:${event.payload?.payment?.entity?.id ?? event.payload?.refund?.entity?.id ?? event.created_at}`;
  try {
    await WebhookEvent.create({ provider: provider.name, eventId: id, type: event.event });
  } catch (err) {
    if (err?.code === 11000) return { duplicate: true };
    throw err;
  }

  const pay = event.payload?.payment?.entity;
  let result = 'ignored';
  let detail;
  try {
    if ((event.event === 'payment.captured' || event.event === 'order.paid') && pay?.order_id) {
      const r = await confirmPayment({
        providerOrderId: pay.order_id,
        providerPaymentId: pay.id,
        via: 'webhook',
        amountPaise: pay.amount,
      });
      result = r.applied ? 'applied' : 'ignored';
      detail = r.reason;
    } else if (event.event === 'payment.failed' && pay?.order_id) {
      const r = await failPayment({ providerOrderId: pay.order_id, reason: pay.error_description });
      result = r.applied ? 'applied' : 'ignored';
    } else if (event.event === 'refund.processed') {
      const rf = event.payload?.refund?.entity;
      const done = await markRefundProcessed({
        providerRefundId: rf?.id,
        providerPaymentId: rf?.payment_id,
        amountPaise: rf?.amount,
      });
      result = done ? 'applied' : 'ignored';
    }
  } catch (err) {
    result = 'error';
    detail = err.message?.slice(0, 200);
    logger.error({ err, eventId: id }, 'webhook handling failed');
  }
  await WebhookEvent.updateOne({ provider: provider.name, eventId: id }, { result, detail });
  if (result === 'error') throw new AppError(500, 'WEBHOOK_FAILED', 'Webhook processing failed');
  return { duplicate: false, result };
}

// ---------------------------------------------------------------- refunds
// A refund is "processed" only when the provider confirms it (webhook), never just because we asked.
export async function initiateRefund(refundId) {
  const refund = await Refund.findOneAndUpdate(
    { _id: refundId, status: { $in: ['pending', 'failed'] } },
    { status: 'processing' },
    { returnDocument: 'after' },
  );
  if (!refund) return null;
  const provider = getProvider();
  const payment = await Payment.findById(refund.paymentId);
  if (!provider || !payment?.providerPaymentId) {
    await Refund.updateOne(
      { _id: refund._id },
      { status: 'pending', failureReason: 'Payment provider is not configured' },
    );
    return null;
  }
  try {
    const r = await provider.refund({
      paymentId: payment.providerPaymentId,
      amountPaise: refund.amountPaise,
      notes: { refundId: String(refund._id) },
    });
    await Refund.updateOne({ _id: refund._id }, { providerRefundId: r.id, status: 'processing' });
    return r;
  } catch (err) {
    await Refund.updateOne(
      { _id: refund._id },
      { status: 'failed', failureReason: String(err?.message ?? err).slice(0, 300) },
    );
    await notifyAdmins({
      type: 'refund.failed',
      title: 'A refund could not be started',
      body: String(err?.message ?? err).slice(0, 200),
      data: { refundId: String(refund._id) },
    });
    return null;
  }
}

export async function markRefundProcessed({ providerRefundId, providerPaymentId, amountPaise }) {
  const refund = providerRefundId ? await Refund.findOne({ providerRefundId }) : null;
  const target =
    refund ??
    (providerPaymentId
      ? await Refund.findOne({
          paymentId: (await Payment.findOne({ providerPaymentId }))?._id,
          status: { $in: ['processing', 'pending'] },
        })
      : null);
  if (!target) return false;
  if (amountPaise != null && amountPaise !== target.amountPaise) return false;
  const moved = await Refund.findOneAndUpdate(
    { _id: target._id, status: { $ne: 'processed' } },
    {
      status: 'processed',
      processedAt: new Date(),
      ...(providerRefundId ? { providerRefundId } : {}),
    },
    { returnDocument: 'after' },
  );
  if (!moved) return false;
  const pay = await Payment.findById(moved.paymentId);
  const refunded = (pay.refundedPaise ?? 0) + moved.amountPaise;
  const full = refunded >= pay.amountPaise;
  await Payment.updateOne(
    { _id: pay._id },
    { refundedPaise: refunded, status: full ? 'refunded' : 'partially_refunded' },
  );
  await Order.updateOne(
    { _id: moved.orderId },
    {
      $inc: { refundedPaise: moved.amountPaise },
      paymentStatus: full ? 'refunded' : 'partially_refunded',
    },
  );
  await notify(moved.buyerId, {
    type: 'refund.processed',
    title: 'Refund completed',
    body: `Your refund of ₹${(moved.amountPaise / 100).toFixed(2)} was confirmed by the payment provider.`,
    data: { orderId: String(moved.orderId) },
  });
  return true;
}

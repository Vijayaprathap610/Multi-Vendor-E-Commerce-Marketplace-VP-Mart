import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import env from '../config/env.js';
import { safeEqual } from '../utils/crypto.js';

// Razorpay integration. Signature checks are pure HMAC-SHA256 maths (documented by Razorpay) and
// need no network, so they run and are tested everywhere. Creating orders and refunds calls the
// Razorpay API and therefore needs real TEST-mode keys; without keys online payment is disabled.
const hmac = (secret, text) => crypto.createHmac('sha256', secret).update(text).digest('hex');

let override = null;
export const setProviderForTests = (p) => {
  override = p;
};

export const onlineEnabled = () => !!override || !!(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);

export function getProvider() {
  if (override) return override;
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) return null;
  const client = new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
  return {
    name: 'razorpay',
    keyId: env.RAZORPAY_KEY_ID,
    keySecret: env.RAZORPAY_KEY_SECRET,
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET,
    createOrder: ({ amountPaise, receipt, notes }) =>
      client.orders.create({ amount: amountPaise, currency: 'INR', receipt, notes }),
    refund: ({ paymentId, amountPaise, notes }) =>
      client.payments.refund(paymentId, { amount: amountPaise, notes }),
  };
}

// Razorpay checkout signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret).
export function verifyCheckoutSignature(
  provider,
  { providerOrderId, providerPaymentId, signature },
) {
  if (!provider?.keySecret || !providerOrderId || !providerPaymentId || !signature) return false;
  return safeEqual(
    hmac(provider.keySecret, `${providerOrderId}|${providerPaymentId}`),
    String(signature),
  );
}

// Webhook signature: HMAC_SHA256(raw request body, webhook_secret).
export function verifyWebhookSignature(provider, rawBody, signature) {
  if (!provider?.webhookSecret || !rawBody || !signature) return false;
  return safeEqual(hmac(provider.webhookSecret, rawBody), String(signature));
}

export const signForTests = hmac;

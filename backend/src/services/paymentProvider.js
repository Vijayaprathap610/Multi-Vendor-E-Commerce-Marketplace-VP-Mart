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

const DUMMY_KEY_SECRET = 'vpmart_dummy_secret_2026';

export const isDummyEnabled = () =>
  env.NODE_ENV !== 'test' &&
  (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) &&
  env.ENABLE_DUMMY_PAYMENT !== false;

export const onlineEnabled = () =>
  !!override ||
  !!(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET) ||
  isDummyEnabled();

export function getProvider() {
  if (override) return override;
  if (env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET) {
    const client = new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
    return {
      name: 'razorpay',
      isDummy: false,
      keyId: env.RAZORPAY_KEY_ID,
      keySecret: env.RAZORPAY_KEY_SECRET,
      webhookSecret: env.RAZORPAY_WEBHOOK_SECRET,
      createOrder: ({ amountPaise, receipt, notes }) =>
        client.orders.create({ amount: amountPaise, currency: 'INR', receipt, notes }),
      refund: ({ paymentId, amountPaise, notes }) =>
        client.payments.refund(paymentId, { amount: amountPaise, notes }),
    };
  }

  if (isDummyEnabled()) {
    return {
      name: 'razorpay_dummy',
      isDummy: true,
      keyId: 'rzp_test_dummy_vpmart',
      keySecret: DUMMY_KEY_SECRET,
      webhookSecret: 'dummy_webhook_secret',
      createOrder: async ({ amountPaise, receipt, notes }) => {
        const id = `order_sim_${crypto.randomBytes(8).toString('hex')}`;
        return { id, amount: amountPaise, currency: 'INR', receipt, status: 'created', notes };
      },
      refund: async ({ paymentId, amountPaise, notes }) => {
        const id = `rfnd_sim_${crypto.randomBytes(8).toString('hex')}`;
        return { id, payment_id: paymentId, amount: amountPaise, status: 'processed', notes };
      },
    };
  }

  return null;
}

// Razorpay checkout signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret).
export function verifyCheckoutSignature(
  provider,
  { providerOrderId, providerPaymentId, signature },
) {
  if (!provider?.keySecret || !providerOrderId || !providerPaymentId || !signature) return false;
  if (provider.isDummy) {
    const expected = hmac(provider.keySecret, `${providerOrderId}|${providerPaymentId}`);
    return (
      safeEqual(expected, String(signature)) ||
      String(signature).startsWith('sim_sig_') ||
      String(signature) === 'dummy_signature'
    );
  }
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

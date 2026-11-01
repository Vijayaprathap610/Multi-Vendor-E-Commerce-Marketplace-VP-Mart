import { z } from 'zod';
import { objectId } from './catalog.js';

const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{10,15}$/, 'Enter a valid phone number');
const code = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9_-]{3,30}$/, 'Enter a valid coupon code');

export const addressBody = z
  .object({
    label: z.string().trim().max(30).optional(),
    name: z.string().trim().min(2).max(80),
    phone,
    line1: z.string().trim().min(3).max(160),
    line2: z.string().trim().max(160).optional(),
    city: z.string().trim().min(2).max(80),
    state: z.string().trim().min(2).max(80),
    pincode: z.string().regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit PIN code'),
    isDefault: z.boolean().optional(),
  })
  .strict();
export const addressUpdateBody = addressBody
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

const buyNow = z
  .object({ listingId: objectId, quantity: z.number().int().min(1).max(20) })
  .strict();
export const previewBody = z
  .object({
    addressId: objectId.optional(),
    couponCode: code.optional(),
    buyNow: buyNow.optional(),
  })
  .strict();
export const checkoutBody = z
  .object({
    addressId: objectId,
    paymentMethod: z.enum(['online', 'cod']),
    couponCode: code.optional(),
    buyNow: buyNow.optional(),
  })
  .strict();
export const couponApplyBody = z.object({ code }).strict();

export const verifyPaymentBody = z
  .object({
    orderId: objectId,
    razorpayPaymentId: z.string().min(5).max(100),
    razorpaySignature: z.string().min(10).max(200),
  })
  .strict();
export const paymentFailedBody = z
  .object({ orderId: objectId, reason: z.string().trim().max(300).optional() })
  .strict();
export const cancelOrderBody = z.object({ reason: z.string().trim().max(300).optional() }).strict();
export const ordersQuery = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict();
export const notificationsQuery = z
  .object({
    unread: z.enum(['true']).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
  })
  .strict();
export const notificationsReadBody = z
  .object({ ids: z.array(objectId).max(100).optional(), all: z.boolean().optional() })
  .strict()
  .refine((v) => v.all || v.ids?.length, { message: 'Choose notifications to mark as read' });

// ---- admin ----
const money = z.number().int().min(1).max(100_000_000);
const couponFields = {
  title: z.string().trim().max(100).optional(),
  discountType: z.enum(['fixed', 'percent']),
  value: z.number().int().min(1).max(100_000_000),
  minPurchasePaise: z.number().int().min(0).max(100_000_000).default(0),
  maxDiscountPaise: money.optional(),
  validFrom: z.coerce.date(),
  validTo: z.coerce.date(),
  appliesToAll: z.boolean().default(false),
  productIds: z.array(objectId).max(100).default([]),
  eligibility: z
    .object({
      mode: z.enum(['all', 'buyers', 'new_buyers']).default('all'),
      buyerIds: z.array(objectId).max(200).default([]),
    })
    .strict()
    .default({ mode: 'all', buyerIds: [] }),
  usageLimit: z.number().int().min(1).max(10_000_000).optional(),
  perBuyerLimit: z.number().int().min(1).max(1000).default(1),
  isPublic: z.boolean().default(false),
  isActive: z.boolean().default(true),
  codePrefix: z.string().trim().max(12).optional(),
};
const couponRules = (v, ctx) => {
  if (v.discountType === 'percent' && v.value > 100)
    ctx.addIssue({ code: 'custom', path: ['value'], message: 'A percentage cannot exceed 100' });
  if (v.discountType === 'fixed' && v.maxDiscountPaise)
    ctx.addIssue({
      code: 'custom',
      path: ['maxDiscountPaise'],
      message: 'A maximum only applies to percentage coupons',
    });
  if (v.validTo <= v.validFrom)
    ctx.addIssue({ code: 'custom', path: ['validTo'], message: 'End must be after start' });
  if (!v.appliesToAll && !v.productIds.length)
    ctx.addIssue({
      code: 'custom',
      path: ['productIds'],
      message: 'Choose at least one product, or apply to all products',
    });
  if (v.appliesToAll && v.productIds.length)
    ctx.addIssue({
      code: 'custom',
      path: ['productIds'],
      message: 'Remove the products or turn off "all products"',
    });
  if (v.eligibility.mode === 'buyers' && !v.eligibility.buyerIds.length)
    ctx.addIssue({ code: 'custom', path: ['eligibility'], message: 'Choose at least one buyer' });
};
export const couponCreateBody = z.object(couponFields).strict().superRefine(couponRules);
export const couponForProductBody = z
  .object({ ...couponFields, appliesToAll: z.literal(false).default(false) })
  .strict()
  .superRefine((v, ctx) =>
    couponRules({ ...v, productIds: v.productIds.length ? v.productIds : ['x'.repeat(24)] }, ctx),
  );
export const couponUpdateBody = z
  .object({
    title: couponFields.title,
    value: couponFields.value.optional(),
    minPurchasePaise: couponFields.minPurchasePaise.optional(),
    maxDiscountPaise: couponFields.maxDiscountPaise.nullable().optional(),
    validFrom: z.coerce.date().optional(),
    validTo: z.coerce.date().optional(),
    productIds: couponFields.productIds.optional(),
    appliesToAll: z.boolean().optional(),
    eligibility: couponFields.eligibility.optional(),
    usageLimit: couponFields.usageLimit.nullable().optional(),
    perBuyerLimit: couponFields.perBuyerLimit.optional(),
    isPublic: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export const couponsQuery = z
  .object({
    status: z.enum(['active', 'inactive', 'expired', 'scheduled']).optional(),
    q: z.string().trim().max(60).optional(),
    productId: objectId.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export const adminOrdersQuery = z
  .object({
    status: z
      .enum(['pending_payment', 'payment_failed', 'confirmed', 'cancelled', 'completed'])
      .optional(),
    paymentStatus: z
      .enum([
        'pending',
        'successful',
        'failed',
        'cancelled',
        'cod_pending',
        'cod_collected',
        'refund_pending',
        'refunded',
        'partially_refunded',
      ])
      .optional(),
    q: z.string().trim().max(40).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export const adminPaymentsQuery = z
  .object({
    status: z.string().trim().max(30).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export const settingsBody = z.object({ commissionPercent: z.number().min(0).max(60) }).strict();

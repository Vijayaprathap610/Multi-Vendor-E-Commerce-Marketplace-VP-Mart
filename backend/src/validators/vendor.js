import { z } from 'zod';
import { objectId } from './catalog.js';

const trimmed = (max, min = 1) => z.string().trim().min(min).max(max);
const pincode = z.string().regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit PIN code');
const paise = z.number().int().min(1).max(100_000_000);

export const profileBody = z
  .object({
    shopName: trimmed(80, 2).optional(),
    description: z.string().trim().max(1000).optional(),
    businessName: trimmed(120, 2).optional(),
    gstin: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Enter a valid GSTIN')
      .or(z.literal(''))
      .optional(),
    fssaiLicense: z
      .string()
      .trim()
      .regex(/^[0-9]{14}$/, 'FSSAI licence numbers have 14 digits')
      .or(z.literal(''))
      .optional(),
    drugLicense: z.string().trim().max(40).or(z.literal('')).optional(),
    logoKey: z.string().max(200).nullable().optional(),
    pickupAddress: z
      .object({
        line1: trimmed(160).optional(),
        line2: z.string().trim().max(160).optional(),
        city: trimmed(80).optional(),
        state: trimmed(80).optional(),
        pincode: pincode.optional(),
        lat: z.number().min(-90).max(90).optional(),
        lng: z.number().min(-180).max(180).optional(),
      })
      .strict()
      .optional(),
    payout: z
      .object({
        accountHolder: trimmed(80, 2).optional(),
        ifsc: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid IFSC')
          .optional(),
      })
      .strict()
      .optional(),
    accountNumber: z
      .string()
      .regex(/^[0-9]{9,18}$/, 'Account number must be 9-18 digits')
      .optional(),
    delivery: z
      .object({
        processingDays: z.number().int().min(0).max(14).optional(),
        dispatchCutoffHour: z.number().int().min(0).max(23).optional(),
        shippingChargePaise: z.number().int().min(0).max(10_000_00).optional(),
        freeShippingAbovePaise: z.number().int().min(0).max(100_000_00).nullable().optional(),
        coverage: z
          .object({
            mode: z.enum(['all', 'prefixes']).optional(),
            pincodePrefixes: z
              .array(z.string().regex(/^[1-9][0-9]{0,5}$/))
              .max(200)
              .optional(),
          })
          .strict()
          .optional(),
        closedWeekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
        unavailableUntil: z.coerce.date().nullable().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

const attributes = z
  .record(z.string().max(40), z.string().max(120))
  .refine((o) => Object.keys(o).length <= 25, 'Too many attributes');
const imageRef = z
  .object({ key: z.string().min(5).max(200), alt: z.string().trim().max(140).optional() })
  .strict();

const productInput = z
  .object({
    name: trimmed(160, 2),
    brand: z
      .object({ id: objectId.optional(), name: trimmed(80, 2).optional() })
      .strict()
      .optional(),
    categoryId: objectId,
    subcategoryId: objectId.optional(),
    description: z.string().trim().max(4000).optional(),
    model: z.string().trim().max(80).optional(),
    version: z.string().trim().max(80).optional(),
    deviceType: z.string().trim().max(80).optional(),
    attributes: attributes.optional(),
  })
  .strict();

export const listingCreateBody = z
  .object({
    productId: objectId.optional(),
    product: productInput.optional(),
    sku: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .regex(/^[A-Za-z0-9._-]+$/, 'Use letters, numbers, dot, dash or underscore'),
    variant: z.string().trim().max(80).optional(),
    description: z.string().trim().max(4000).optional(),
    pricePaise: paise,
    mrpPaise: paise,
    stock: z.number().int().min(0).max(1_000_000),
    images: z.array(imageRef).max(8).default([]),
    attributes: attributes.optional(),
    prescriptionRequired: z.boolean().optional(),
    expiryDate: z.coerce.date().optional(),
  })
  .strict()
  .refine((v) => !!v.productId !== !!v.product, {
    message: 'Provide either productId or product details',
    path: ['product'],
  });

export const listingUpdateBody = z
  .object({
    sku: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .regex(/^[A-Za-z0-9._-]+$/)
      .optional(),
    description: z.string().trim().max(4000).optional(),
    pricePaise: paise.optional(),
    mrpPaise: paise.optional(),
    stock: z.number().int().min(0).max(1_000_000).optional(),
    manualOutOfStock: z.boolean().optional(),
    status: z.enum(['active', 'inactive']).optional(),
    images: z.array(imageRef).max(8).optional(),
    attributes: attributes.optional(),
    prescriptionRequired: z.boolean().optional(),
    expiryDate: z.coerce.date().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export const vendorListingsQuery = z
  .object({
    q: z.string().trim().max(80).optional(),
    status: z.enum(['active', 'inactive', 'hidden']).optional(),
    stock: z.enum(['out']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const shipmentStatusBody = z
  .object({
    status: z.enum(['packing', 'packed']),
  })
  .strict();

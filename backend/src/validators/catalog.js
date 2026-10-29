import { z } from 'zod';
import { SORTS } from '../services/search.js';

const list = z
  .string()
  .trim()
  .max(300)
  .transform((s) =>
    s
      .split(',')
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 12),
  );
const rupees = z.coerce
  .number()
  .min(0)
  .max(100_000_000)
  .transform((v) => Math.round(v * 100));
export const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');
export const idParams = z.object({ id: objectId }).strict();

export const searchQuery = z
  .object({
    q: z.string().trim().max(80).optional(),
    category: list.optional(),
    brand: list.optional(),
    vendor: z.string().trim().toLowerCase().max(80).optional(),
    collection: z.enum(['trending', 'best-sellers', 'deals', 'new-arrivals']).optional(),
    minPrice: rupees.optional(),
    maxPrice: rupees.optional(),
    sort: z.enum(SORTS).default('relevance'),
    inStock: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    page: z.coerce.number().int().min(1).max(500).default(1),
    limit: z.coerce.number().int().min(1).max(48).default(24),
  })
  .strict()
  .refine((v) => v.minPrice == null || v.maxPrice == null || v.minPrice <= v.maxPrice, {
    message: 'Minimum price cannot exceed maximum price',
    path: ['minPrice'],
  });

export const pincodeQuery = z
  .object({
    pincode: z
      .string()
      .regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit PIN code')
      .optional(),
  })
  .strict();
export const suggestQuery = z.object({ q: z.string().trim().min(1).max(60) }).strict();
export const pageQuery = z
  .object({
    page: z.coerce.number().int().min(1).max(500).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict();
export const slugParams = z.object({ slug: z.string().trim().toLowerCase().max(100) }).strict();

export const contactBody = z
  .object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().toLowerCase().email().max(254),
    subject: z.string().trim().max(120).optional(),
    message: z.string().trim().min(10, 'Please write at least 10 characters').max(3000),
  })
  .strict();

export const cartAddBody = z
  .object({ listingId: objectId, quantity: z.number().int().min(1).max(20).default(1) })
  .strict();
export const cartSetBody = z.object({ quantity: z.number().int().min(1).max(20) }).strict();
export const cartItemParams = z.object({ listingId: objectId }).strict();
export const quoteBody = z
  .object({
    items: z
      .array(z.object({ listingId: objectId, quantity: z.number().int().min(1).max(20) }).strict())
      .min(1)
      .max(30),
  })
  .strict();

import { z } from 'zod';
import { objectId } from './catalog.js';

const name = z.string().trim().min(2).max(80);

export const categoryCreateBody = z
  .object({
    name,
    parent: objectId.nullable().optional(),
    description: z.string().trim().max(300).optional(),
    sortOrder: z.number().int().min(0).max(10000).optional(),
    regulation: z.enum(['none', 'food', 'medicine', 'inherit']).optional(),
    deviceFields: z.boolean().optional(),
    gstPercent: z.number().min(0).max(40).optional(),
    shipping: z
      .object({
        maxZone: z.enum(['local', 'circle', 'region', 'national']),
        extraDays: z.number().int().min(0).max(14).default(0),
      })
      .strict()
      .optional(),
    imageKey: z.string().max(200).nullable().optional(),
  })
  .strict();
export const categoryUpdateBody = categoryCreateBody
  .omit({ parent: true })
  .extend({ isActive: z.boolean().optional() })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export const brandBody = z
  .object({
    name,
    isActive: z.boolean().optional(),
    logoKey: z.string().max(200).nullable().optional(),
  })
  .strict();
export const brandUpdateBody = brandBody
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

const destination = z
  .string()
  .trim()
  .max(300)
  .refine(
    (v) => (v.startsWith('/') && !v.startsWith('//')) || /^https:\/\/[^\s]+$/i.test(v),
    'Use an internal path like /c/electronics or an https:// URL',
  );
const bannerFields = {
  title: z.string().trim().min(2).max(100),
  description: z.string().trim().max(240).optional(),
  imageKey: z.string().min(5).max(200),
  ctaLabel: z.string().trim().max(30).optional(),
  destination,
  kind: z.enum(['banner', 'festival', 'launch', 'ad']).default('banner'),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(1000).default(0),
};
export const bannerCreateBody = z
  .object(bannerFields)
  .strict()
  .refine((v) => v.endAt > v.startAt, { message: 'End must be after start', path: ['endAt'] });
export const bannerUpdateBody = z
  .object(bannerFields)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export const adminListingsQuery = z
  .object({
    q: z.string().trim().max(80).optional(),
    vendor: objectId.optional(),
    category: objectId.optional(),
    status: z.enum(['active', 'inactive', 'hidden']).optional(),
    stock: z.enum(['out']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export const moderationBody = z
  .object({
    action: z.enum(['hide', 'unhide']),
    reason: z.string().trim().min(3).max(300).optional(),
  })
  .strict()
  .refine((v) => v.action === 'unhide' || !!v.reason, {
    message: 'A reason is required to hide a listing',
    path: ['reason'],
  });
export const vendorsQuery = z
  .object({
    status: z
      .enum(['active', 'pending_approval', 'rejected', 'suspended', 'deactivated'])
      .optional(),
    q: z.string().trim().max(80).optional(),
    submitted: z.enum(['true']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export const warningBody = z.object({ message: z.string().trim().min(5).max(300) }).strict();
export const reviewNoteBody = z.object({ reviewNote: z.string().trim().max(300) }).strict();

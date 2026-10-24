import { z } from 'zod';

export const updateProfileBody = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9]{10,15}$/, 'Enter a valid phone number (10-15 digits)')
      .nullable()
      .optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export const passwordConfirmBody = z
  .object({ password: z.string().min(1, 'Password is required').max(128) })
  .strict();

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');

export const adminUserIdParams = z.object({ id: objectId }).strict();

export const adminListQuery = z
  .object({
    role: z.enum(['buyer', 'vendor', 'delivery_agent', 'admin']).optional(),
    status: z
      .enum(['active', 'pending_approval', 'rejected', 'suspended', 'deactivated', 'deleted'])
      .optional(),
    q: z.string().trim().max(80).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const adminStatusBody = z
  .object({
    status: z.enum(['active', 'rejected', 'suspended']),
    reason: z.string().trim().max(300).optional(),
  })
  .strict();
